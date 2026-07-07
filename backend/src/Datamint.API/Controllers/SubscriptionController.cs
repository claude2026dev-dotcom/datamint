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

    public SubscriptionController(DatamintDbContext db, IPaymentService payments, ICurrentUserService currentUser, IAuditService audit)
    {
        _db = db;
        _payments = payments;
        _currentUser = currentUser;
        _audit = audit;
    }

    /// <summary>Public plans list for the pricing page. Prices are data-driven — edit from Admin > Plans once decided.</summary>
    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken ct)
    {
        var plans = await _db.Plans.Where(p => p.IsActive).OrderBy(p => p.Price).ToListAsync(ct);
        return Ok(new
        {
            success = true,
            plans = plans.Select(p => new PlanDto(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyUploadLimit, p.IsActive))
        });
    }

    [HttpGet("status")]
    [Authorize]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var sub = await _db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.UserId == userId && s.Status == SubscriptionStatus.Active)
            .OrderByDescending(s => s.StartAtUtc)
            .FirstOrDefaultAsync(ct);

        if (sub is null)
            return Ok(new { success = true, status = new SubscriptionStatusDto(false, null, null, 0, 0) });

        return Ok(new
        {
            success = true,
            status = new SubscriptionStatusDto(true, sub.Plan.Name, sub.EndAtUtc, sub.UploadsUsedThisCycle, sub.Plan.MonthlyUploadLimit)
        });
    }

    /// <summary>
    /// For $0 plans (the Free tier, or any plan whose real price hasn't been set
    /// from Admin > Plans yet) - activates the subscription directly, no Razorpay
    /// round-trip, since there's nothing to charge.
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
        var subscription = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Active,
            StartAtUtc = DateTime.UtcNow,
            EndAtUtc = plan.BillingCycle == PlanBillingCycle.Yearly ? DateTime.UtcNow.AddYears(1) : DateTime.UtcNow.AddMonths(1)
        };
        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.Activated", userId, "Subscription", subscription.Id.ToString(), "Zero-cost plan activated without payment.", ct: ct);

        return Ok(new { success = true, message = $"{plan.Name} plan activated." });
    }

    /// <summary>Step 1 of checkout: create a Razorpay order for the chosen plan.</summary>
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
            RazorpayOrderId = order.OrderId,
            Amount = plan.Price,
            Currency = plan.Currency,
            Status = "created"
        });
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, order });
    }

    /// <summary>Step 2: frontend posts back the Razorpay payment id + signature from the checkout widget for verification.</summary>
    [HttpPost("checkout/verify")]
    [Authorize]
    public async Task<IActionResult> VerifyPayment(VerifyPaymentRequestDto dto, CancellationToken ct)
    {
        var valid = _payments.VerifySignature(dto.RazorpayOrderId, dto.RazorpayPaymentId, dto.RazorpaySignature);
        var userId = _currentUser.UserId!.Value;

        var transaction = await _db.PaymentTransactions.FirstOrDefaultAsync(t => t.RazorpayOrderId == dto.RazorpayOrderId && t.UserId == userId, ct);
        if (transaction is null) return NotFound(new { success = false, message = "Transaction not found." });

        if (!valid)
        {
            transaction.Status = "failed";
            await _db.SaveChangesAsync(ct);
            await _audit.LogAsync("Subscription.PaymentVerify", userId, isSuccess: false, ct: ct);
            return BadRequest(new { success = false, message = "Payment verification failed. Please contact support if the amount was debited." });
        }

        transaction.Status = "paid";
        transaction.RazorpayPaymentId = dto.RazorpayPaymentId;
        transaction.RazorpaySignature = dto.RazorpaySignature;

        var plan = await _db.Plans.FirstAsync(p => p.Id == dto.PlanId, ct);
        var subscription = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Active,
            StartAtUtc = DateTime.UtcNow,
            EndAtUtc = plan.BillingCycle == PlanBillingCycle.Yearly ? DateTime.UtcNow.AddYears(1) : DateTime.UtcNow.AddMonths(1)
        };
        _db.Subscriptions.Add(subscription);
        transaction.SubscriptionId = subscription.Id;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Subscription.Activated", userId, "Subscription", subscription.Id.ToString(), ct: ct);

        return Ok(new { success = true, message = "Subscription activated successfully." });
    }
}
