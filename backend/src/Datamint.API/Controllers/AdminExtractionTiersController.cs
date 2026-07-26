using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Full CRUD for Extraction Tiers - the admin-configurable mapping of which AI
/// provider/model/prompt-customization a subscription plan uses, entirely invisible to the
/// end user. Same thin, direct-to-DbContext shape as the OAuth admin controllers.</summary>
[ApiController]
[Route("api/admin/extraction-tiers")]
[Authorize(Roles = "Admin")]
public class AdminExtractionTiersController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminExtractionTiersController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
    }

    private static ExtractionTierDto ToDto(ExtractionTier t, int planCount) =>
        new(t.Id, t.Name, t.AiProvider.ToString(), t.ModelName, t.CustomOutputFormatExample, t.CustomInstructions, t.IsDefault, t.IsEnabled, planCount, t.CreatedAtUtc);

    [HttpGet]
    public async Task<IActionResult> GetTiers([FromQuery] ExtractionTierFilterDto filter, CancellationToken ct)
    {
        var query = _db.ExtractionTiers.AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(x => x.Name.Contains(s) || x.ModelName.Contains(s));
        }
        if (filter.IsEnabled is not null) query = query.Where(x => x.IsEnabled == filter.IsEnabled);

        var total = await query.CountAsync(ct);
        var tiers = await query.OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name)
            .Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .ToListAsync(ct);

        var planCounts = await _db.Plans.Where(p => p.ExtractionTierId != null)
            .GroupBy(p => p.ExtractionTierId!.Value)
            .Select(g => new { TierId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.TierId, g => g.Count, ct);

        var items = tiers.Select(t => ToDto(t, planCounts.GetValueOrDefault(t.Id, 0))).ToList();
        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTier(Guid id, CancellationToken ct)
    {
        var tier = await _db.ExtractionTiers.FindAsync(new object[] { id }, ct);
        if (tier is null) return NotFound(new { success = false, message = "Extraction tier not found." });

        var planCount = await _db.Plans.CountAsync(p => p.ExtractionTierId == id, ct);
        return Ok(new { success = true, tier = ToDto(tier, planCount) });
    }

    [HttpPost]
    public async Task<IActionResult> CreateTier(CreateExtractionTierRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.ModelName))
            return BadRequest(new { success = false, message = "Name and model name are required." });
        if (!Enum.TryParse<AiProvider>(dto.AiProvider, out var provider))
            return BadRequest(new { success = false, message = "AI provider must be 'Claude' or 'OpenAi'." });

        var tier = new ExtractionTier
        {
            Name = dto.Name.Trim(),
            AiProvider = provider,
            ModelName = dto.ModelName.Trim(),
            CustomOutputFormatExample = string.IsNullOrWhiteSpace(dto.CustomOutputFormatExample) ? null : dto.CustomOutputFormatExample.Trim(),
            CustomInstructions = string.IsNullOrWhiteSpace(dto.CustomInstructions) ? null : dto.CustomInstructions.Trim(),
            IsDefault = false,
            IsEnabled = true
        };
        _db.ExtractionTiers.Add(tier);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("ExtractionTier.Created", _currentUser.UserId, "ExtractionTier", tier.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { tier.Name, tier.AiProvider, tier.ModelName }), ct: ct);

        return Ok(new { success = true, tier = ToDto(tier, 0) });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateTier(Guid id, UpdateExtractionTierRequestDto dto, CancellationToken ct)
    {
        var tier = await _db.ExtractionTiers.FindAsync(new object[] { id }, ct);
        if (tier is null) return NotFound(new { success = false, message = "Extraction tier not found." });
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.ModelName))
            return BadRequest(new { success = false, message = "Name and model name are required." });
        if (!Enum.TryParse<AiProvider>(dto.AiProvider, out var provider))
            return BadRequest(new { success = false, message = "AI provider must be 'Claude' or 'OpenAi'." });

        tier.Name = dto.Name.Trim();
        tier.AiProvider = provider;
        tier.ModelName = dto.ModelName.Trim();
        tier.CustomOutputFormatExample = string.IsNullOrWhiteSpace(dto.CustomOutputFormatExample) ? null : dto.CustomOutputFormatExample.Trim();
        tier.CustomInstructions = string.IsNullOrWhiteSpace(dto.CustomInstructions) ? null : dto.CustomInstructions.Trim();
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("ExtractionTier.Updated", _currentUser.UserId, "ExtractionTier", tier.Id.ToString(), ct: ct);

        return Ok(new { success = true });
    }

    [HttpPut("{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleActive(Guid id, CancellationToken ct)
    {
        var tier = await _db.ExtractionTiers.FindAsync(new object[] { id }, ct);
        if (tier is null) return NotFound(new { success = false, message = "Extraction tier not found." });
        if (tier.IsDefault) return BadRequest(new { success = false, message = "The default tier can't be disabled - it's the fallback every plan without its own tier relies on." });

        tier.IsEnabled = !tier.IsEnabled;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(tier.IsEnabled ? "ExtractionTier.Enabled" : "ExtractionTier.Disabled", _currentUser.UserId, "ExtractionTier", tier.Id.ToString(), ct: ct);

        return Ok(new { success = true, isEnabled = tier.IsEnabled });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTier(Guid id, CancellationToken ct)
    {
        var tier = await _db.ExtractionTiers.FindAsync(new object[] { id }, ct);
        if (tier is null) return NotFound(new { success = false, message = "Extraction tier not found." });
        if (tier.IsDefault) return BadRequest(new { success = false, message = "The default tier can't be deleted - it's the fallback every plan without its own tier relies on." });

        var planCount = await _db.Plans.CountAsync(p => p.ExtractionTierId == id, ct);
        if (planCount > 0) return Conflict(new { success = false, message = $"This tier is still mapped to {planCount} plan(s) - remap or delete those plans first." });

        tier.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("ExtractionTier.Deleted", _currentUser.UserId, "ExtractionTier", tier.Id.ToString(), tier.Name, ct: ct);

        return Ok(new { success = true });
    }
}
