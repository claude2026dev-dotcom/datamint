using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

[ApiController]
[Route("api/subscription")]
public class SubscriptionController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IPaymentService _payments;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    private readonly IBillingNotificationService _billing;

    public SubscriptionController(DatamintDbContext db, IPaymentService payments, ICurrentUserService currentUser, IAuditService audit, IBillingNotificationService billing)
    {
        _db = db;
        _payments = payments;
        _currentUser = currentUser;
        _audit = audit;
        _billing = billing;
    }

    /// <summary>Public plans list for the pricing page. Prices are data-driven — edit from Admin > Plans once decided.
    /// The free trial plan is deliberately excluded - it's auto-granted once at sign-in
    /// (see AuthController.EnsureFreePlanActivatedAsync), never something to pick from a
    /// list, so it never appears here as a selectable card.</summary>
    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken ct)
    {
        var plans = await _db.Plans.Where(p => p.IsActive && !p.IsFreeTrial).OrderBy(p => p.Price).ToListAsync(ct);
        return Ok(new
        {
            success = true,
            plans = plans.Select(p => new PlanDto(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyPageLimit, p.IsRecurring, p.IsActive, p.IsFreeTrial))
        });
    }

    /// <summary>Cancelling doesn't end access immediately - it just stops the plan from
    /// renewing, so a subscription is still "usable" for the rest of the cycle already
    /// paid for. Every place that needs to know "can this user still upload/see their
    /// plan as active" checks this same condition (Active, or Cancelled but not yet
    /// past EndAtUtc) rather than a plain Status == Active.</summary>
    [HttpGet("status")]
    [Authorize]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var sub = await _db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.UserId == userId && (s.Status == SubscriptionStatus.Active || s.Status == SubscriptionStatus.Cancelled))
            .OrderByDescending(s => s.StartAtUtc)
            .FirstOrDefaultAsync(ct);

        if (sub is null)
            return Ok(new { success = true, status = new SubscriptionStatusDto(false, null, null, null, null, null, null, null, null, 0, 0, true, false) });

        var isUsable = sub.Status == SubscriptionStatus.Active || sub.EndAtUtc > DateTime.UtcNow;

        return Ok(new
        {
            success = true,
            status = new SubscriptionStatusDto(
                isUsable, sub.PlanId, sub.Plan.Name, sub.Plan.Price, sub.Plan.Currency, sub.Plan.BillingCycle.ToString(),
                sub.Status.ToString(), sub.StartAtUtc, sub.EndAtUtc, sub.PagesUsedThisCycle, sub.Plan.MonthlyPageLimit, sub.Plan.IsRecurring,
                sub.Status == SubscriptionStatus.Cancelled)
        });
    }

    /// <summary>Cancels the caller's active plan - it keeps working until the current
    /// billing period ends (they already paid for it), it just won't renew.</summary>
    [HttpPost("cancel")]
    [Authorize]
    public async Task<IActionResult> CancelSubscription(CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var sub = await _db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.UserId == userId && s.Status == SubscriptionStatus.Active)
            .OrderByDescending(s => s.StartAtUtc)
            .FirstOrDefaultAsync(ct);

        if (sub is null) return NotFound(new { success = false, message = "You don't have an active plan to cancel." });
        if (!sub.Plan.IsRecurring) return BadRequest(new { success = false, message = "This plan doesn't renew, so there's nothing to cancel." });

        sub.Status = SubscriptionStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.Cancelled", userId, "Subscription", sub.Id.ToString(), ct: ct);

        return Ok(new
        {
            success = true,
            message = sub.EndAtUtc is not null
                ? $"Your {sub.Plan.Name} plan won't renew. You'll keep access until {sub.EndAtUtc:MMM d, yyyy}."
                : $"Your {sub.Plan.Name} plan has been cancelled."
        });
    }

    /// <summary>
    /// For $0 plans (the Free tier, or any plan whose real price hasn't been set
    /// from Admin > Plans yet) - activates the subscription directly, no payment
    /// gateway round-trip, since there's nothing to charge.
    /// </summary>
    [HttpPost("activate-free")]
    [Authorize]
    public async Task<IActionResult> ActivateFreePlan(ActivatePlanRequestDto dto, CancellationToken ct)
    {
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == dto.PlanId && p.IsActive, ct);
        if (plan is null) return NotFound(new { success = false, message = "Selected plan was not found." });
        if (plan.Price != 0)
            return BadRequest(new { success = false, message = "This plan requires payment - use checkout instead." });

        var userId = _currentUser.UserId!.Value;

        // The free trial is a one-time perk granted automatically at sign-in, never
        // something to (re-)pick manually - without this check, cancelling back to it
        // (or hitting this endpoint directly) would hand out a brand new Subscription
        // row with PagesUsedThisCycle reset to 0, letting the same user re-earn the
        // trial's page allowance indefinitely.
        if (plan.IsFreeTrial)
        {
            var alreadyHadTrial = await _db.Subscriptions.AnyAsync(s => s.UserId == userId && s.Plan.IsFreeTrial, ct);
            if (alreadyHadTrial)
                return BadRequest(new { success = false, message = "You've already used your free trial. Please choose a paid plan to continue." });
        }

        var startAt = DateTime.UtcNow;
        var subscription = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Active,
            StartAtUtc = startAt,
            EndAtUtc = plan.ComputeSubscriptionEndAt(startAt)
        };
        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.Activated", userId, "Subscription", subscription.Id.ToString(), "Zero-cost plan activated without payment.", ct: ct);

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        if (user is not null) await _billing.SendPlanActivatedEmailAsync(user, plan.Name, ct);

        return Ok(new { success = true, message = $"{plan.Name} plan activated." });
    }

    /// <summary>Step 1 of checkout: create a payment-gateway order for the chosen plan.</summary>
    [HttpPost("checkout/create-order")]
    [Authorize]
    public async Task<IActionResult> CreateOrder(CreateOrderRequestDto dto, CancellationToken ct)
    {
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == dto.PlanId && p.IsActive, ct);
        if (plan is null) return NotFound(new { success = false, message = "Selected plan was not found." });
        if (plan.Price == 0)
            return BadRequest(new { success = false, message = "This plan is free - use activate-free instead." });

        var userId = _currentUser.UserId!.Value;
        var order = await _payments.CreateOrderAsync(plan.Price, plan.Currency, $"plan-{plan.Id}-user-{userId}", ct);

        _db.PaymentTransactions.Add(new PaymentTransaction
        {
            UserId = userId,
            PlanId = plan.Id,
            Provider = _payments.ProviderName,
            ProviderOrderId = order.OrderId,
            Amount = plan.Price,
            Currency = plan.Currency,
            Status = "created"
        });
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.OrderCreated", userId, "Plan", plan.Id.ToString(),
            $"{{\"amount\":{plan.Price},\"currency\":\"{plan.Currency}\",\"orderId\":\"{order.OrderId}\"}}", ct: ct);

        return Ok(new { success = true, order });
    }

    /// <summary>Step 2: frontend posts back the payment id + signature from the checkout widget for verification.</summary>
    [HttpPost("checkout/verify")]
    [Authorize]
    public async Task<IActionResult> VerifyPayment(VerifyPaymentRequestDto dto, CancellationToken ct)
    {
        var valid = _payments.VerifySignature(dto.ProviderOrderId, dto.ProviderPaymentId, dto.ProviderSignature);
        var userId = _currentUser.UserId!.Value;

        var transaction = await _db.PaymentTransactions.FirstOrDefaultAsync(t => t.ProviderOrderId == dto.ProviderOrderId && t.UserId == userId, ct);
        if (transaction is null) return NotFound(new { success = false, message = "Transaction not found." });

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == dto.PlanId, ct);

        if (!valid)
        {
            transaction.Status = "failed";
            await _db.SaveChangesAsync(ct);
            await _audit.LogAsync("Subscription.PaymentVerify", userId, isSuccess: false, ct: ct);
            if (user is not null && plan is not null)
                await _billing.SendPaymentFailedEmailAsync(user, plan.Name, transaction.Amount, transaction.Currency, ct);
            return BadRequest(new { success = false, message = "Payment verification failed. Please contact support if the amount was debited." });
        }

        if (plan is null) return NotFound(new { success = false, message = "Selected plan was not found." });

        transaction.Status = "paid";
        transaction.ProviderPaymentId = dto.ProviderPaymentId;
        transaction.ProviderSignature = dto.ProviderSignature;

        var startAt = DateTime.UtcNow;
        var subscription = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Active,
            StartAtUtc = startAt,
            EndAtUtc = plan.ComputeSubscriptionEndAt(startAt)
        };
        _db.Subscriptions.Add(subscription);
        transaction.SubscriptionId = subscription.Id;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.Activated", userId, "Subscription", subscription.Id.ToString(), ct: ct);

        if (user is not null)
        {
            var invoiceNumber = $"INV-{transaction.CreatedAtUtc:yyyyMMdd}-{transaction.Id.ToString("N")[..8].ToUpperInvariant()}";
            await _billing.SendPaymentSuccessEmailAsync(user, plan.Name, transaction.Amount, transaction.Currency, invoiceNumber, DateTime.UtcNow, ct);
        }

        return Ok(new { success = true, message = "Subscription activated successfully." });
    }
}
