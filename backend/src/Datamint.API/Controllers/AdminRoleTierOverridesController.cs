using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Admin-only view/edit of the two fixed role rows (Admin, User) each optionally
/// pinned to an Extraction Tier - see RoleExtractionTierOverride and
/// IExtractionTierResolver.ResolveForUserAsync for how this is applied. Rows are seeded once at
/// startup and only ever updated here, never created/deleted.</summary>
[ApiController]
[Route("api/admin/role-tier-overrides")]
[Authorize(Roles = "Admin")]
public class AdminRoleTierOverridesController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminRoleTierOverridesController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> GetOverrides(CancellationToken ct)
    {
        var items = await _db.RoleExtractionTierOverrides
            .Include(r => r.ExtractionTier)
            .OrderBy(r => r.Role)
            .Select(r => new RoleTierOverrideDto(r.Role, r.ExtractionTierId, r.ExtractionTier != null ? r.ExtractionTier.Name : null))
            .ToListAsync(ct);

        return Ok(new { success = true, items });
    }

    [HttpPut("{role}")]
    public async Task<IActionResult> UpdateOverride(string role, UpdateRoleTierOverrideRequestDto dto, CancellationToken ct)
    {
        var entry = await _db.RoleExtractionTierOverrides.FirstOrDefaultAsync(r => r.Role == role, ct);
        if (entry is null) return NotFound(new { success = false, message = "Unknown role." });

        if (dto.ExtractionTierId is { } tierId && !await _db.ExtractionTiers.AnyAsync(t => t.Id == tierId, ct))
            return BadRequest(new { success = false, message = "Selected extraction tier not found." });

        entry.ExtractionTierId = dto.ExtractionTierId;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("RoleTierOverride.Updated", _currentUser.UserId, "RoleExtractionTierOverride", entry.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { Role = role, dto.ExtractionTierId }), ct: ct);

        return Ok(new { success = true });
    }
}
