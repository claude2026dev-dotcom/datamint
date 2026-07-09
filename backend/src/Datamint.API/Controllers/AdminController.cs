using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
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

    public AdminController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser, IAuthNotificationService notify, IPasswordResetService passwordReset)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
        _notify = notify;
        _passwordReset = passwordReset;
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
        var query = _db.AuditLogs.Include(a => a.User).AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Action)) query = query.Where(a => a.Action.Contains(filter.Action));
        if (filter.UserId is not null) query = query.Where(a => a.UserId == filter.UserId);
        if (!string.IsNullOrWhiteSpace(filter.UserEmail)) query = query.Where(a => a.User != null && a.User.Email.Contains(filter.UserEmail));
        if (filter.FromUtc is not null) query = query.Where(a => a.CreatedAtUtc >= filter.FromUtc);
        if (filter.ToUtc is not null) query = query.Where(a => a.CreatedAtUtc <= filter.ToUtc);
        if (filter.IsSuccess is not null) query = query.Where(a => a.IsSuccess == filter.IsSuccess);

        var total = await query.CountAsync(ct);
        var asc = string.Equals(filter.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        query = asc ? query.OrderBy(a => a.CreatedAtUtc) : query.OrderByDescending(a => a.CreatedAtUtc);

        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .Select(a => new AuditLogDto(a.Id, a.User != null ? a.User.Email : null, a.Action, a.EntityType, a.EntityId, a.Details, a.IpAddress, a.UserAgent, a.IsSuccess, a.CreatedAtUtc))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] AdminUserFilterDto filter, CancellationToken ct)
    {
        var query = _db.Users.AsQueryable();

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
            _ => desc ? query.OrderByDescending(u => u.CreatedAtUtc) : query.OrderBy(u => u.CreatedAtUtc),
        };

        var total = await query.CountAsync(ct);
        var items = await query.Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(u => new AdminUserListItemDto(u.Id, u.Email, u.DisplayName, u.Role, u.IsActive,
                _db.Subscriptions.Where(s => s.UserId == u.Id && s.Status == SubscriptionStatus.Active)
                    .OrderByDescending(s => s.StartAtUtc).Select(s => s.Plan.Name).FirstOrDefault(),
                u.CreatedAtUtc, u.LastLoginAtUtc, u.PasswordHash != null))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpPut("users/{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleUserActive(Guid id, CancellationToken ct)
    {
        if (id == _currentUser.UserId) return BadRequest(new { success = false, message = "You can't disable your own account." });

        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });
        var wasActive = user.IsActive;
        user.IsActive = !user.IsActive;
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

        var snapshot = JsonSerializer.Serialize(new { user.Email, user.DisplayName, user.Role });
        var email = user.Email;
        var displayName = user.DisplayName;

        user.IsActive = false;
        user.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Admin.UserDeleted", _currentUser.UserId, "User", user.Id.ToString(), snapshot, ct: ct);
        await _notify.SendAccountDeletedEmailAsync(email, displayName, ct);
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
            .Select(p => new AdminPlanDto(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyUploadLimit, p.IsActive,
                _db.Subscriptions.Count(s => s.PlanId == p.Id && s.Status == SubscriptionStatus.Active)))
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
            MonthlyUploadLimit = dto.MonthlyUploadLimit
        };
        _db.Plans.Add(plan);
        await _db.SaveChangesAsync(ct);
        var snapshot = JsonSerializer.Serialize(new { plan.Name, plan.Price, plan.Currency, BillingCycle = plan.BillingCycle.ToString(), plan.MonthlyUploadLimit });
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
        var previousUploadLimit = plan.MonthlyUploadLimit;

        plan.Name = dto.Name;
        plan.Description = dto.Description;
        plan.Price = dto.Price;
        plan.Currency = dto.Currency;
        plan.BillingCycle = Enum.Parse<PlanBillingCycle>(dto.BillingCycle);
        plan.MonthlyUploadLimit = dto.MonthlyUploadLimit;
        await _db.SaveChangesAsync(ct);

        var diff = BuildDiff(
            ("name", previousName, plan.Name),
            ("description", previousDescription, plan.Description),
            ("price", previousPrice, plan.Price),
            ("currency", previousCurrency, plan.Currency),
            ("billingCycle", previousBillingCycle.ToString(), plan.BillingCycle.ToString()),
            ("monthlyUploadLimit", previousUploadLimit, plan.MonthlyUploadLimit));
        await _audit.LogAsync("Admin.PlanUpdated", _currentUser.UserId, "Plan", plan.Id.ToString(), diff, ct: ct);
        var subscriberCount = await _db.Subscriptions.CountAsync(s => s.PlanId == plan.Id && s.Status == SubscriptionStatus.Active, ct);
        return Ok(new { success = true, plan = ToAdminPlanDto(plan, subscriberCount) });
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
        new(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyUploadLimit, p.IsActive, activeSubscribers);

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

    /// <summary>Builds a compact JSON diff of only the fields that actually changed, so audit
    /// log entries show exactly what an admin edited instead of just "something changed".</summary>
    private static string? BuildDiff(params (string Field, object? Before, object? After)[] changes)
    {
        var diff = changes.Where(c => !Equals(c.Before, c.After))
            .ToDictionary(c => c.Field, c => new { from = c.Before, to = c.After });
        return diff.Count == 0 ? null : JsonSerializer.Serialize(diff);
    }
}
