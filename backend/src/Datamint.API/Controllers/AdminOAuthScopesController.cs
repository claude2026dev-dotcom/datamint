using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Full CRUD for OAuth2 scopes (e.g. "documents.read") - assignable to clients,
/// shown on the consent screen. Same thin, direct-to-DbContext shape as AdminController.</summary>
[ApiController]
[Route("api/admin/oauth/scopes")]
[Authorize(Roles = "Admin")]
public class AdminOAuthScopesController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public AdminOAuthScopesController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> GetScopes([FromQuery] OAuthScopeFilterDto filter, CancellationToken ct)
    {
        var query = _db.OAuthScopes.AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(x => x.Name.Contains(s) || x.DisplayName.Contains(s));
        }
        if (filter.IsEnabled is not null) query = query.Where(x => x.IsEnabled == filter.IsEnabled);

        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name)
            .Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(x => new OAuthScopeDto(x.Id, x.Name, x.DisplayName, x.Description, x.IsDefault, x.IsEnabled, x.Clients.Count, x.CreatedAtUtc))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpPost]
    public async Task<IActionResult> CreateScope(CreateOAuthScopeRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.DisplayName))
            return BadRequest(new { success = false, message = "Name and display name are required." });

        var name = dto.Name.Trim();
        if (await _db.OAuthScopes.AnyAsync(s => s.Name == name, ct))
            return Conflict(new { success = false, message = "A scope with this name already exists." });

        var scope = new OAuthScope
        {
            Name = name,
            DisplayName = dto.DisplayName.Trim(),
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            IsDefault = dto.IsDefault,
            IsEnabled = true
        };
        _db.OAuthScopes.Add(scope);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ScopeCreated", _currentUser.UserId, "OAuthScope", scope.Id.ToString(), scope.Name, ct: ct);

        return Ok(new { success = true, scope = new OAuthScopeDto(scope.Id, scope.Name, scope.DisplayName, scope.Description, scope.IsDefault, scope.IsEnabled, 0, scope.CreatedAtUtc) });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateScope(Guid id, UpdateOAuthScopeRequestDto dto, CancellationToken ct)
    {
        var scope = await _db.OAuthScopes.FindAsync(new object[] { id }, ct);
        if (scope is null) return NotFound(new { success = false, message = "Scope not found." });
        if (string.IsNullOrWhiteSpace(dto.DisplayName))
            return BadRequest(new { success = false, message = "Display name is required." });

        scope.DisplayName = dto.DisplayName.Trim();
        scope.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        scope.IsDefault = dto.IsDefault;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ScopeUpdated", _currentUser.UserId, "OAuthScope", scope.Id.ToString(), ct: ct);

        return Ok(new { success = true });
    }

    [HttpPut("{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleActive(Guid id, CancellationToken ct)
    {
        var scope = await _db.OAuthScopes.FindAsync(new object[] { id }, ct);
        if (scope is null) return NotFound(new { success = false, message = "Scope not found." });

        scope.IsEnabled = !scope.IsEnabled;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(scope.IsEnabled ? "OAuth.ScopeEnabled" : "OAuth.ScopeDisabled", _currentUser.UserId, "OAuthScope", scope.Id.ToString(), ct: ct);

        return Ok(new { success = true, isEnabled = scope.IsEnabled });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteScope(Guid id, CancellationToken ct)
    {
        var scope = await _db.OAuthScopes.FindAsync(new object[] { id }, ct);
        if (scope is null) return NotFound(new { success = false, message = "Scope not found." });

        scope.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ScopeDeleted", _currentUser.UserId, "OAuthScope", scope.Id.ToString(), scope.Name, ct: ct);

        return Ok(new { success = true });
    }
}
