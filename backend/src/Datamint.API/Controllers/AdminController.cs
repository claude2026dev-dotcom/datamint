using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Every action here requires the Admin role — enforced by the [Authorize(Roles="Admin")] on the class.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuthNotificationService _notify;
    private readonly IPasswordResetService _passwordReset;
    private readonly ISessionService _sessions;
    private readonly IPaymentService _payments;

    public AdminController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser, IAuthNotificationService notify, IPasswordResetService passwordReset, ISessionService sessions, IPaymentService payments)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
        _notify = notify;
        _passwordReset = passwordReset;
        _sessions = sessions;
        _payments = payments;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var stats = new AdminDashboardStatsDto(
            TotalUsers: await _db.Users.CountAsync(ct),
            ActiveSubscriptions: await _db.Subscriptions.CountAsync(s => s.Status == SubscriptionStatus.Active, ct),
            TotalDocumentsProcessed: await _db.Documents.CountAsync(d => d.Status == DocumentStatus.Extracted || d.Status == DocumentStatus.Exported, ct),
            DocumentsProcessedToday: await _db.Documents.CountAsync(d => d.CreatedAtUtc >= today, ct),
            FailedExtractionsLast7Days: await _db.Documents.CountAsync(d => d.Status == DocumentStatus.Failed && d.CreatedAtUtc >= today.AddDays(-7), ct),
            RevenueThisMonth: await _db.PaymentTransactions
                .Where(t => t.Status == "paid" && t.CreatedAtUtc.Month == today.Month && t.CreatedAtUtc.Year == today.Year)
                .SumAsync(t => (decimal?)t.Amount, ct) ?? 0
        );
        return Ok(new { success = true, stats });
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] AuditLogFilterDto filter, CancellationToken ct)
    {
        // Manual join against IgnoreQueryFilters() Users, not .Include(a => a.User): the global
        // soft-delete filter would otherwise silently drop the join for any action performed by
        // an account that has since been deleted, making a perfectly attributable audit entry
        // (AuditLog.UserId is populated) display as "Anonymous" - misleading for a historical record
        // that exists specifically to show who did what.
        var query =
            from a in _db.AuditLogs.AsQueryable()
            join u in _db.Users.IgnoreQueryFilters() on a.UserId equals u.Id into users
            from u in users.DefaultIfEmpty()
            select new { AuditLog = a, User = u };

        if (!string.IsNullOrWhiteSpace(filter.Action)) query = query.Where(x => x.AuditLog.Action.Contains(filter.Action));
        if (filter.UserId is not null) query = query.Where(x => x.AuditLog.UserId == filter.UserId);
        if (!string.IsNullOrWhiteSpace(filter.UserEmail)) query = query.Where(x => x.User != null && x.User.Email.Contains(filter.UserEmail));
        if (filter.FromUtc is not null) query = query.Where(x => x.AuditLog.CreatedAtUtc >= filter.FromUtc);
        if (filter.ToUtc is not null) query = query.Where(x => x.AuditLog.CreatedAtUtc <= filter.ToUtc);
        if (filter.IsSuccess is not null) query = query.Where(x => x.AuditLog.IsSuccess == filter.IsSuccess);

        var total = await query.CountAsync(ct);
        var asc = string.Equals(filter.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        query = asc ? query.OrderBy(x => x.AuditLog.CreatedAtUtc) : query.OrderByDescending(x => x.AuditLog.CreatedAtUtc);

        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .Select(x => new AuditLogDto(x.AuditLog.Id, x.User != null ? x.User.Email : null, x.AuditLog.Action, x.AuditLog.EntityType,
                x.AuditLog.EntityId, x.AuditLog.Details, x.AuditLog.IpAddress, x.AuditLog.UserAgent, x.AuditLog.IsSuccess, x.AuditLog.CreatedAtUtc))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] AdminUserFilterDto filter, CancellationToken ct)
    {
        // Deactivated accounts are excluded from every other listing/report by the global
        // soft-delete filter - IncludeDeactivated deliberately switches to a *separate*
        // deactivated-only view (via IgnoreQueryFilters) rather than mixing them into the
        // normal list, so "how many active users do we have" never accidentally counts
        // someone mid-way through their erasure grace period.
        var query = filter.IncludeDeactivated
            ? _db.Users.IgnoreQueryFilters().Where(u => u.IsDeleted)
            : _db.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(u => u.Email.Contains(s) || (u.DisplayName != null && u.DisplayName.Contains(s)));
        }
        if (!string.IsNullOrWhiteSpace(filter.Role)) query = query.Where(u => u.Role == filter.Role);
        if (filter.IsActive is not null) query = query.Where(u => u.IsActive == filter.IsActive);

        var desc = !string.Equals(filter.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        query = filter.SortBy?.ToLowerInvariant() switch
        {
            "email" => desc ? query.OrderByDescending(u => u.Email) : query.OrderBy(u => u.Email),
            "displayname" => desc ? query.OrderByDescending(u => u.DisplayName) : query.OrderBy(u => u.DisplayName),
            "lastlogin" => desc ? query.OrderByDescending(u => u.LastLoginAtUtc) : query.OrderBy(u => u.LastLoginAtUtc),
            "role" => desc ? query.OrderByDescending(u => u.Role) : query.OrderBy(u => u.Role),
            _ => filter.IncludeDeactivated
                ? (desc ? query.OrderByDescending(u => u.DeactivatedAtUtc) : query.OrderBy(u => u.DeactivatedAtUtc))
                : (desc ? query.OrderByDescending(u => u.CreatedAtUtc) : query.OrderBy(u => u.CreatedAtUtc)),
        };

        var total = await query.CountAsync(ct);
        var rows = await query.Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(u => new
            {
                u.Id, u.Email, u.DisplayName, u.Role, u.IsActive,
                // Deliberately NOT .IgnoreQueryFilters() here - mixing a filtered and an
                // unfiltered query root in the same projection/subquery made EF Core drop
                // the outer Users query's own soft-delete filter too (verified: CountAsync
                // on `query` alone correctly excluded deactivated users, but this combined
                // Select did not) - so a deactivated account leaked into the default,
                // non-"deactivated view" user list. Subscriptions are never soft-deleted in
                // practice anyway, so the plain filtered query is equivalent here.
                CurrentPlan = _db.Subscriptions.Where(s => s.UserId == u.Id && s.Status == SubscriptionStatus.Active)
                    .OrderByDescending(s => s.StartAtUtc).Select(s => s.Plan.Name).FirstOrDefault(),
                u.CreatedAtUtc, u.LastLoginAtUtc, HasPassword = u.PasswordHash != null, u.IsSuperAdmin,
                u.IsDeleted, u.DeactivatedAtUtc
            })
            .ToListAsync(ct);

        // Computed client-side (not in the SQL projection above) - DateTime arithmetic like
        // this doesn't reliably translate to SQL across providers, and this is cheap once
        // the page of rows is already in memory.
        var items = rows.Select(r => new AdminUserListItemDto(r.Id, r.Email, r.DisplayName, r.Role, r.IsActive,
            r.CurrentPlan, r.CreatedAtUtc, r.LastLoginAtUtc, r.HasPassword, r.IsSuperAdmin, r.IsDeleted, r.DeactivatedAtUtc,
            r.DeactivatedAtUtc is null ? null : Math.Max(0, ApplicationUser.DeactivationGraceDays - (int)(DateTime.UtcNow - r.DeactivatedAtUtc.Value).TotalDays)));

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpPut("users/{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleUserActive(Guid id, CancellationToken ct)
    {
        if (id == _currentUser.UserId) return BadRequest(new { success = false, message = "You can't disable your own account." });

        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });
        if (user.IsSuperAdmin) return BadRequest(new { success = false, message = "The super admin account can't be disabled." });
        var wasActive = user.IsActive;
        user.IsActive = !user.IsActive;
        if (!user.IsActive)
            await _sessions.RevokeAllSessionsAsync(user, ct); // disabling: kill every existing session immediately, not just at next token expiry
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(user.IsActive ? "Admin.UserEnabled" : "Admin.UserDisabled", _currentUser.UserId, "User", user.Id.ToString(),
            BuildDiff(("isActive", wasActive, user.IsActive)), ct: ct);
        await _notify.SendAccountStatusChangedEmailAsync(user, user.IsActive, ct);
        return Ok(new { success = true, isActive = user.IsActive });
    }

    /// <summary>
    /// Admins never set or see a user's password directly — that would mean the platform
    /// (and anyone with admin access) could impersonate any account. Instead this sends the
    /// user the same secure reset-link email as a self-service "forgot password" would.
    /// </summary>
    [HttpPost("users/{id:guid}/send-password-reset")]
    public async Task<IActionResult> SendPasswordReset(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });
        if (user.PasswordHash is null) return BadRequest(new { success = false, message = "This account signs in with Google and has no password to reset." });

        var rawToken = await _passwordReset.CreateResetTokenAsync(user.Id, ct);
        await _audit.LogAsync("Admin.PasswordResetTriggered", _currentUser.UserId, "User", user.Id.ToString(), ct: ct);
        await _notify.SendPasswordResetEmailAsync(user, rawToken, triggeredByAdmin: true, ct);

        return Ok(new { success = true, message = $"A password reset link has been sent to {user.Email}." });
    }

    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, UpdateUserRequestDto dto, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        var previousRole = user.Role;
        var previousDisplayName = user.DisplayName;

        if (!string.IsNullOrWhiteSpace(dto.Role))
        {
            if (dto.Role != "Admin" && dto.Role != "User") return BadRequest(new { success = false, message = "Role must be 'Admin' or 'User'." });
            if (id == _currentUser.UserId && dto.Role != "Admin") return BadRequest(new { success = false, message = "You can't remove your own admin role." });
            if (user.IsSuperAdmin && dto.Role != "Admin") return BadRequest(new { success = false, message = "The super admin account's role can't be changed." });
            user.Role = dto.Role;
        }
        if (dto.DisplayName is not null) user.DisplayName = dto.DisplayName.Trim();

        await _db.SaveChangesAsync(ct);
        var diff = BuildDiff(("displayName", previousDisplayName, user.DisplayName), ("role", previousRole, user.Role));
        await _audit.LogAsync("Admin.UserUpdated", _currentUser.UserId, "User", user.Id.ToString(), diff, ct: ct);
        return Ok(new { success = true, user = new { user.Id, user.Email, user.DisplayName, user.Role, user.IsActive } });
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id, CancellationToken ct)
    {
        if (id == _currentUser.UserId) return BadRequest(new { success = false, message = "You can't delete your own account." });

        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });
        if (user.IsSuperAdmin) return BadRequest(new { success = false, message = "The super admin account can't be deleted." });

        var snapshot = JsonSerializer.Serialize(new { user.Email, user.DisplayName, user.Role });
        var email = user.Email;
        var displayName = user.DisplayName;

        user.IsActive = false;
        user.IsDeleted = true;
        user.DeactivatedAtUtc = DateTime.UtcNow;
        await _sessions.RevokeAllSessionsAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        await AuthController.CancelActiveSubscriptionsAsync(_db, user.Id, ct);
        await _audit.LogAsync("Admin.UserDeactivated", _currentUser.UserId, "User", user.Id.ToString(), snapshot, ct: ct);
        await _notify.SendAccountDeletedEmailAsync(email, displayName, ct);
        return Ok(new { success = true });
    }

    /// <summary>
    /// Admin override of the self-service "log back in to reactivate" path - useful when
    /// the deactivated account is Google-only and the person asks support for help, or an
    /// admin deactivated the wrong account by mistake. Only works inside the same
    /// DeactivationGraceDays window as self-reactivation - once AccountPurgeService has
    /// anonymized the row there's nothing left to restore.
    /// </summary>
    [HttpPut("users/{id:guid}/reactivate")]
    public async Task<IActionResult> ReactivateUser(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null || !user.IsDeleted) return NotFound(new { success = false, message = "Deactivated user not found." });
        if (user.PurgedAtUtc is not null) return BadRequest(new { success = false, message = "This account was already permanently erased and can't be recovered." });

        user.IsDeleted = false;
        user.IsActive = true;
        user.DeactivatedAtUtc = null;
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("Admin.UserReactivated", _currentUser.UserId, "User", user.Id.ToString(), ct: ct);
        return Ok(new { success = true });
    }

    [HttpGet("plans")]
    public async Task<IActionResult> GetAllPlans(CancellationToken ct)
    {
        // Project straight into AdminPlanDto (rather than returning the raw
        // entity) so the BillingCycle enum serializes as "Monthly"/"Yearly"
        // instead of a bare integer, and so admins can see how many active
        // subscribers a plan has before deciding to hide/delete it.
        var plans = await _db.Plans
            .Select(p => new AdminPlanDto(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyPageLimit, p.IsRecurring, p.IsActive,
                _db.Subscriptions.Count(s => s.PlanId == p.Id && s.Status == SubscriptionStatus.Active), p.IsFreeTrial))
            .ToListAsync(ct);
        return Ok(new { success = true, plans });
    }

    [HttpPost("plans")]
    public async Task<IActionResult> CreatePlan(CreatePlanRequestDto dto, CancellationToken ct)
    {
        var plan = new Domain.Entities.Plan
        {
            Name = dto.Name,
            Description = dto.Description,
            Price = dto.Price,
            Currency = dto.Currency,
            BillingCycle = Enum.Parse<PlanBillingCycle>(dto.BillingCycle),
            MonthlyPageLimit = dto.MonthlyPageLimit,
            IsRecurring = dto.IsRecurring,
            IsFreeTrial = dto.IsFreeTrial
        };
        _db.Plans.Add(plan);

        // Only one plan can ever be THE free trial - flagging a new one un-flags
        // whichever plan held it before, rather than leaving two plans both claiming
        // to be it (which would make EnsureFreePlanActivatedAsync's lookup ambiguous).
        if (dto.IsFreeTrial)
            await UnflagOtherFreeTrialPlansAsync(plan.Id, ct);

        await _db.SaveChangesAsync(ct);
        var snapshot = JsonSerializer.Serialize(new { plan.Name, plan.Price, plan.Currency, BillingCycle = plan.BillingCycle.ToString(), plan.MonthlyPageLimit });
        await _audit.LogAsync("Admin.PlanCreated", _currentUser.UserId, "Plan", plan.Id.ToString(), snapshot, ct: ct);
        return Ok(new { success = true, plan = ToAdminPlanDto(plan, 0) });
    }

    [HttpPut("plans/{id:guid}")]
    public async Task<IActionResult> UpdatePlan(Guid id, UpdatePlanRequestDto dto, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });

        var previousName = plan.Name;
        var previousDescription = plan.Description;
        var previousPrice = plan.Price;
        var previousCurrency = plan.Currency;
        var previousBillingCycle = plan.BillingCycle;
        var previousPageLimit = plan.MonthlyPageLimit;
        var previousIsRecurring = plan.IsRecurring;
        var previousIsFreeTrial = plan.IsFreeTrial;

        plan.Name = dto.Name;
        plan.Description = dto.Description;
        plan.Price = dto.Price;
        plan.Currency = dto.Currency;
        plan.BillingCycle = Enum.Parse<PlanBillingCycle>(dto.BillingCycle);
        plan.MonthlyPageLimit = dto.MonthlyPageLimit;
        plan.IsRecurring = dto.IsRecurring;
        plan.IsFreeTrial = dto.IsFreeTrial;

        if (dto.IsFreeTrial)
            await UnflagOtherFreeTrialPlansAsync(plan.Id, ct);

        await _db.SaveChangesAsync(ct);

        var diff = BuildDiff(
            ("name", previousName, plan.Name),
            ("description", previousDescription, plan.Description),
            ("price", previousPrice, plan.Price),
            ("currency", previousCurrency, plan.Currency),
            ("billingCycle", previousBillingCycle.ToString(), plan.BillingCycle.ToString()),
            ("monthlyPageLimit", previousPageLimit, plan.MonthlyPageLimit),
            ("isRecurring", previousIsRecurring, plan.IsRecurring),
            ("isFreeTrial", previousIsFreeTrial, plan.IsFreeTrial));
        await _audit.LogAsync("Admin.PlanUpdated", _currentUser.UserId, "Plan", plan.Id.ToString(), diff, ct: ct);
        var subscriberCount = await _db.Subscriptions.CountAsync(s => s.PlanId == plan.Id && s.Status == SubscriptionStatus.Active, ct);
        return Ok(new { success = true, plan = ToAdminPlanDto(plan, subscriberCount) });
    }

    private async Task UnflagOtherFreeTrialPlansAsync(Guid keepPlanId, CancellationToken ct)
    {
        var others = await _db.Plans.Where(p => p.IsFreeTrial && p.Id != keepPlanId).ToListAsync(ct);
        foreach (var other in others) other.IsFreeTrial = false;
    }

    [HttpDelete("plans/{id:guid}")]
    public async Task<IActionResult> DeletePlan(Guid id, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });

        var hasActiveSubs = await _db.Subscriptions.AnyAsync(s => s.PlanId == id && s.Status == SubscriptionStatus.Active, ct);
        if (hasActiveSubs) return BadRequest(new { success = false, message = "This plan has active subscribers and can't be deleted. Disable it instead." });

        var snapshot = JsonSerializer.Serialize(new { plan.Name, plan.Price, plan.Currency, BillingCycle = plan.BillingCycle.ToString() });
        plan.IsActive = false;
        plan.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Admin.PlanDeleted", _currentUser.UserId, "Plan", plan.Id.ToString(), snapshot, ct: ct);
        return Ok(new { success = true });
    }

    private static AdminPlanDto ToAdminPlanDto(Domain.Entities.Plan p, int activeSubscribers) =>
        new(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyPageLimit, p.IsRecurring, p.IsActive, activeSubscribers, p.IsFreeTrial);

    [HttpPut("plans/{id:guid}/toggle-active")]
    public async Task<IActionResult> TogglePlanActive(Guid id, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });
        var wasActive = plan.IsActive;
        plan.IsActive = !plan.IsActive;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(plan.IsActive ? "Admin.PlanEnabled" : "Admin.PlanDisabled", _currentUser.UserId, "Plan", plan.Id.ToString(),
            BuildDiff(("isActive", wasActive, plan.IsActive)), ct: ct);
        return Ok(new { success = true, isActive = plan.IsActive });
    }

    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactions([FromQuery] int page = 1, [FromQuery] int pageSize = 25, [FromQuery] string? status = null, CancellationToken ct = default)
    {
        var query = _db.PaymentTransactions.Include(t => t.User).AsQueryable();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(t => t.Status == status);
        query = query.OrderByDescending(t => t.CreatedAtUtc);

        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(t => new AdminTransactionDto(t.Id, t.User.Email, t.Provider, t.ProviderOrderId, t.ProviderPaymentId,
                t.Amount, t.Currency, t.Status, t.CreatedAtUtc, t.RefundedAtUtc, t.RefundAmount, t.RefundReason))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, page, pageSize });
    }

    /// <summary>
    /// Full refund of a paid transaction, triggered by an admin (e.g. an accidental duplicate
    /// charge or a support-requested reversal). Also immediately revokes the subscription that
    /// payment activated - a refund means the user shouldn't keep the access it paid for, unlike
    /// a normal cancellation (which lets the current, already-paid-for period run out).
    /// </summary>
    [HttpPost("transactions/{id:guid}/refund")]
    public async Task<IActionResult> RefundTransaction(Guid id, RefundRequestDto dto, CancellationToken ct)
    {
        var transaction = await _db.PaymentTransactions.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transaction is null) return NotFound(new { success = false, message = "Transaction not found." });
        if (transaction.Status != "paid") return BadRequest(new { success = false, message = "Only a successfully paid transaction can be refunded." });
        if (transaction.ProviderPaymentId is null) return BadRequest(new { success = false, message = "This transaction has no payment id to refund." });

        var result = await _payments.RefundAsync(transaction.ProviderPaymentId, transaction.Amount, transaction.Currency, dto.Reason, ct);
        if (!result.Success)
        {
            await _audit.LogAsync("Admin.RefundFailed", _currentUser.UserId, "PaymentTransaction", transaction.Id.ToString(), result.ErrorMessage, isSuccess: false, ct: ct);
            return BadRequest(new { success = false, message = result.ErrorMessage ?? "Refund failed at the payment gateway. Please try again." });
        }

        transaction.Status = "refunded";
        transaction.RefundedAtUtc = DateTime.UtcNow;
        transaction.RefundAmount = transaction.Amount;
        transaction.RefundReason = dto.Reason;
        transaction.ProviderRefundId = result.ProviderRefundId;

        if (transaction.SubscriptionId is not null)
        {
            var subscription = await _db.Subscriptions.FirstOrDefaultAsync(s => s.Id == transaction.SubscriptionId, ct);
            if (subscription is not null && subscription.Status is SubscriptionStatus.Active or SubscriptionStatus.PastDue)
            {
                subscription.Status = SubscriptionStatus.Cancelled;
                subscription.EndAtUtc = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Admin.RefundIssued", _currentUser.UserId, "PaymentTransaction", transaction.Id.ToString(),
            BuildDiff(("amount", 0m, transaction.RefundAmount), ("reason", null, dto.Reason)), ct: ct);

        return Ok(new { success = true, message = "Refund issued and access revoked." });
    }

    /// <summary>Builds a compact JSON diff of only the fields that actually changed, so audit
    /// log entries show exactly what an admin edited instead of just "something changed".</summary>
    private static string? BuildDiff(params (string Field, object? Before, object? After)[] changes)
    {
        var diff = changes.Where(c => !Equals(c.Before, c.After))
            .ToDictionary(c => c.Field, c => new { from = c.Before, to = c.After });
        return diff.Count == 0 ? null : JsonSerializer.Serialize(diff);
    }
}
