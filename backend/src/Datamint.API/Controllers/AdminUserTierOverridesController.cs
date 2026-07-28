using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Admin-only management of a hand-negotiated per-customer Extraction Tier override -
/// see UserExtractionTierOverride and IExtractionTierResolver.ResolveForUserAsync for how it's
/// applied (highest priority, above the Role override and the user's Plan). Unlike the fixed
/// two-row Role override table, this is genuinely optional per user: GET returns null when no
/// override exists, PUT creates-or-updates the one row for that user, DELETE removes it.</summary>
[ApiController]
[Route("api/admin/user-tier-overrides")]
[Authorize(Roles = "Admin")]
public class AdminUserTierOverridesController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminUserTierOverridesController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
    }

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetOverride(Guid userId, CancellationToken ct)
    {
        var user = await _db.Users.Where(u => u.Id == userId).Select(u => new { u.Id, u.Email }).FirstOrDefaultAsync(ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        var entry = await _db.UserExtractionTierOverrides
            .Include(o => o.ExtractionTier)
            .FirstOrDefaultAsync(o => o.UserId == userId, ct);

        var dto = new UserTierOverrideDto(user.Id, user.Email, entry?.ExtractionTierId, entry?.ExtractionTier?.Name);
        return Ok(new { success = true, item = dto });
    }

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> SetOverride(Guid userId, SetUserTierOverrideRequestDto dto, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        var tier = await _db.ExtractionTiers.FirstOrDefaultAsync(t => t.Id == dto.ExtractionTierId, ct);
        if (tier is null) return BadRequest(new { success = false, message = "Selected extraction tier not found." });

        var entry = await _db.UserExtractionTierOverrides.FirstOrDefaultAsync(o => o.UserId == userId, ct);
        if (entry is null)
        {
            entry = new UserExtractionTierOverride { UserId = userId, ExtractionTierId = dto.ExtractionTierId };
            _db.UserExtractionTierOverrides.Add(entry);
        }
        else
        {
            entry.ExtractionTierId = dto.ExtractionTierId;
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("UserTierOverride.Set", _currentUser.UserId, "UserExtractionTierOverride", entry.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { TargetUserId = userId, user.Email, TierName = tier.Name }), ct: ct);

        return Ok(new { success = true, item = new UserTierOverrideDto(userId, user.Email, tier.Id, tier.Name) });
    }

    [HttpDelete("{userId:guid}")]
    public async Task<IActionResult> ClearOverride(Guid userId, CancellationToken ct)
    {
        var entry = await _db.UserExtractionTierOverrides.FirstOrDefaultAsync(o => o.UserId == userId, ct);
        if (entry is null) return Ok(new { success = true }); // already clear - not an error

        // A genuine hard delete, not the usual IsDeleted=true soft-delete every other entity in
        // this app uses - deliberately, for two reasons: (1) the unique index on UserId isn't
        // filtered to exclude soft-deleted rows, so a soft-deleted row would permanently block
        // ever re-assigning that same user an override again; (2) this row is a pure on/off
        // assignment toggle, not a business record with content worth retaining - the AuditLog
        // entry below is what preserves the historical fact that it existed, not the row itself.
        _db.UserExtractionTierOverrides.Remove(entry);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("UserTierOverride.Cleared", _currentUser.UserId, "UserExtractionTierOverride", entry.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { TargetUserId = userId }), ct: ct);

        return Ok(new { success = true });
    }
}
