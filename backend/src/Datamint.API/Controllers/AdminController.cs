using Datamint.Application.DTOs;
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
    public AdminController(DatamintDbContext db) => _db = db;

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
        if (filter.FromUtc is not null) query = query.Where(a => a.CreatedAtUtc >= filter.FromUtc);
        if (filter.ToUtc is not null) query = query.Where(a => a.CreatedAtUtc <= filter.ToUtc);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(a => a.CreatedAtUtc)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .Select(a => new AuditLogDto(a.Id, a.User != null ? a.User.Email : null, a.Action, a.EntityType, a.EntityId, a.Details, a.IpAddress, a.IsSuccess, a.CreatedAtUtc))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(int page = 1, int pageSize = 25, CancellationToken ct = default)
    {
        var query = _db.Users.OrderByDescending(u => u.CreatedAtUtc);
        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new AdminUserListItemDto(u.Id, u.Email, u.DisplayName, u.Role, u.IsActive,
                _db.Subscriptions.Where(s => s.UserId == u.Id && s.Status == SubscriptionStatus.Active)
                    .OrderByDescending(s => s.StartAtUtc).Select(s => s.Plan.Name).FirstOrDefault(),
                u.CreatedAtUtc, u.LastLoginAtUtc))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, page, pageSize });
    }

    [HttpPut("users/{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleUserActive(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { id }, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });
        user.IsActive = !user.IsActive;
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true, isActive = user.IsActive });
    }

    [HttpGet("plans")]
    public async Task<IActionResult> GetAllPlans(CancellationToken ct) =>
        Ok(new { success = true, plans = await _db.Plans.ToListAsync(ct) });

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
        return Ok(new { success = true, plan });
    }

    [HttpPut("plans/{id:guid}/toggle-active")]
    public async Task<IActionResult> TogglePlanActive(Guid id, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });
        plan.IsActive = !plan.IsActive;
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true, isActive = plan.IsActive });
    }
}
