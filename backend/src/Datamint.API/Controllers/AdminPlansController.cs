using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Full CRUD for subscription plans, including which Extraction Tier (AI provider/
/// model/prompt customization) each plan maps to. Same thin, direct-to-DbContext shape as the
/// OAuth admin controllers.</summary>
[ApiController]
[Route("api/admin/plans")]
[Authorize(Roles = "Admin")]
public class AdminPlansController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminPlansController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
    }

    private static PlanDto ToDto(Plan p, int activeSubscribers = 0) =>
        new(p.Id, p.Name, p.Description, p.Price, p.Currency, p.BillingCycle.ToString(), p.MonthlyPageLimit, p.IsRecurring, p.IsActive, p.IsFreeTrial, p.ExtractionTierId, activeSubscribers, p.IsContactOnly);

    [HttpGet]
    public async Task<IActionResult> GetPlans([FromQuery] PlanFilterDto filter, CancellationToken ct)
    {
        var query = _db.Plans.AsQueryable();
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(x => x.Name.Contains(s));
        }
        if (filter.IsActive is not null) query = query.Where(x => x.IsActive == filter.IsActive);

        var total = await query.CountAsync(ct);
        var plans = await query.OrderBy(x => x.Price)
            .Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .ToListAsync(ct);

        var subscriberCounts = await _db.Subscriptions.Where(s => s.Status == SubscriptionStatus.Active)
            .GroupBy(s => s.PlanId)
            .Select(g => new { PlanId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.PlanId, g => g.Count, ct);

        var items = plans.Select(p => ToDto(p, subscriberCounts.GetValueOrDefault(p.Id, 0))).ToList();
        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpPost]
    public async Task<IActionResult> CreatePlan(CreatePlanRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { success = false, message = "Name is required." });
        if (!Enum.TryParse<PlanBillingCycle>(dto.BillingCycle, out var cycle))
            return BadRequest(new { success = false, message = "Billing cycle must be 'Monthly' or 'Yearly'." });
        if (dto.IsFreeTrial && await _db.Plans.AnyAsync(p => p.IsFreeTrial, ct))
            return BadRequest(new { success = false, message = "A free trial plan already exists - only one plan can be flagged as the free trial." });
        if (dto.IsFreeTrial && dto.IsContactOnly)
            return BadRequest(new { success = false, message = "A plan can't be both the free trial and contact-only - the free trial must stay self-serve." });

        var plan = new Plan
        {
            Name = dto.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            Price = dto.Price,
            Currency = string.IsNullOrWhiteSpace(dto.Currency) ? "INR" : dto.Currency.Trim(),
            BillingCycle = cycle,
            MonthlyPageLimit = dto.MonthlyPageLimit,
            IsRecurring = dto.IsRecurring,
            IsFreeTrial = dto.IsFreeTrial,
            IsActive = true,
            ExtractionTierId = dto.ExtractionTierId,
            IsContactOnly = dto.IsContactOnly
        };
        _db.Plans.Add(plan);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Plan.Created", _currentUser.UserId, "Plan", plan.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { plan.Name, plan.Price, plan.MonthlyPageLimit }), ct: ct);

        return Ok(new { success = true, plan = ToDto(plan) });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdatePlan(Guid id, UpdatePlanRequestDto dto, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { success = false, message = "Name is required." });
        if (!Enum.TryParse<PlanBillingCycle>(dto.BillingCycle, out var cycle))
            return BadRequest(new { success = false, message = "Billing cycle must be 'Monthly' or 'Yearly'." });
        if (plan.IsFreeTrial && dto.IsContactOnly)
            return BadRequest(new { success = false, message = "The free trial plan can't be marked contact-only - it must stay self-serve." });

        plan.Name = dto.Name.Trim();
        plan.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        plan.Price = dto.Price;
        plan.Currency = string.IsNullOrWhiteSpace(dto.Currency) ? "INR" : dto.Currency.Trim();
        plan.BillingCycle = cycle;
        plan.MonthlyPageLimit = dto.MonthlyPageLimit;
        // IsRecurring/IsFreeTrial can't be edited after creation - changing them would silently
        // reinterpret every existing Subscription row created under the plan's original
        // semantics; delete and recreate the plan instead if these truly need to change.
        plan.ExtractionTierId = dto.ExtractionTierId;
        plan.IsContactOnly = dto.IsContactOnly;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Plan.Updated", _currentUser.UserId, "Plan", plan.Id.ToString(), ct: ct);

        return Ok(new { success = true });
    }

    [HttpPut("{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleActive(Guid id, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });
        if (plan.IsFreeTrial) return BadRequest(new { success = false, message = "The free trial plan can't be disabled." });

        plan.IsActive = !plan.IsActive;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(plan.IsActive ? "Plan.Enabled" : "Plan.Disabled", _currentUser.UserId, "Plan", plan.Id.ToString(), ct: ct);

        return Ok(new { success = true, isActive = plan.IsActive });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeletePlan(Guid id, CancellationToken ct)
    {
        var plan = await _db.Plans.FindAsync(new object[] { id }, ct);
        if (plan is null) return NotFound(new { success = false, message = "Plan not found." });
        if (plan.IsFreeTrial) return BadRequest(new { success = false, message = "The free trial plan can't be deleted." });

        var subscriberCount = await _db.Subscriptions.CountAsync(s => s.PlanId == id, ct);
        if (subscriberCount > 0) return Conflict(new { success = false, message = $"This plan has {subscriberCount} subscriber(s) - disable it instead of deleting." });

        plan.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Plan.Deleted", _currentUser.UserId, "Plan", plan.Id.ToString(), plan.Name, ct: ct);

        return Ok(new { success = true });
    }
}
