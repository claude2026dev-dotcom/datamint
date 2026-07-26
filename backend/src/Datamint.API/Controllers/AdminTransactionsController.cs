using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Read-only transaction history plus an admin-triggered refund action, which
/// immediately revokes whichever subscription that payment activated.</summary>
[ApiController]
[Route("api/admin/transactions")]
[Authorize(Roles = "Admin")]
public class AdminTransactionsController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IPaymentService _payments;
    private readonly IBillingNotificationService _billing;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminTransactionsController(DatamintDbContext db, IPaymentService payments, IBillingNotificationService billing, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _payments = payments;
        _billing = billing;
        _audit = audit;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> GetTransactions([FromQuery] TransactionFilterDto filter, CancellationToken ct)
    {
        var query = _db.PaymentTransactions.Include(t => t.User).AsQueryable();
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(t => t.User.Email.Contains(s) || t.ProviderOrderId.Contains(s));
        }
        if (!string.IsNullOrWhiteSpace(filter.Status)) query = query.Where(t => t.Status == filter.Status);

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(t => t.CreatedAtUtc)
            .Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(t => new AdminTransactionDto(t.Id, t.User.Email, t.Provider, t.ProviderOrderId, t.ProviderPaymentId,
                t.Amount, t.Currency, t.Status, t.CreatedAtUtc, t.RefundedAtUtc, t.RefundAmount, t.RefundReason))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpPost("{id:guid}/refund")]
    public async Task<IActionResult> Refund(Guid id, RefundRequestDto dto, CancellationToken ct)
    {
        var transaction = await _db.PaymentTransactions.Include(t => t.User).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transaction is null) return NotFound(new { success = false, message = "Transaction not found." });
        if (transaction.Status != "paid") return BadRequest(new { success = false, message = "Only a successfully paid transaction can be refunded." });

        var result = await _payments.RefundAsync(transaction.ProviderPaymentId!, transaction.Amount, transaction.Currency, dto.Reason, ct);
        if (!result.Success)
            return BadRequest(new { success = false, message = result.ErrorMessage ?? "Refund failed." });

        transaction.Status = "refunded";
        transaction.RefundedAtUtc = DateTime.UtcNow;
        transaction.RefundAmount = transaction.Amount;
        transaction.RefundReason = dto.Reason;
        transaction.ProviderRefundId = result.ProviderRefundId;

        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == transaction.PlanId, ct);

        // A refund immediately revokes the subscription that payment activated - the plan was
        // paid for and is being unpaid, so access ends now, not at the end of the billing cycle.
        if (transaction.SubscriptionId is { } subId)
        {
            var subscription = await _db.Subscriptions.FirstOrDefaultAsync(s => s.Id == subId, ct);
            if (subscription is not null)
            {
                subscription.Status = SubscriptionStatus.Cancelled;
                subscription.EndAtUtc = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Transaction.Refunded", _currentUser.UserId, "PaymentTransaction", transaction.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { transaction.Amount, transaction.Currency, dto.Reason }), ct: ct);

        if (plan is not null)
            await _billing.SendRefundConfirmationEmailAsync(transaction.User, plan.Name, transaction.Amount, transaction.Currency, ct);

        return Ok(new { success = true, message = "Refund issued and subscription revoked." });
    }
}
