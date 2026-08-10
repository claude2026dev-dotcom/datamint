using System.Text.Json;
using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>Full CRUD for registered OAuth2 clients - same thin, direct-to-DbContext shape as
/// AdminController's own CRUD actions (simple enough not to need a service layer, unlike the
/// real protocol logic in IOAuthService).</summary>
[ApiController]
[Route("api/admin/oauth/clients")]
[Authorize(Roles = "Admin")]
public class AdminOAuthClientsController : ControllerBase
{
    private const int MinAccessTokenMinutes = 1, MaxAccessTokenMinutes = 60;
    private const int MinRefreshTokenDays = 1, MaxRefreshTokenDays = 90;

    private readonly DatamintDbContext _db;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;
    private readonly IJwtTokenService _jwt;

    public AdminOAuthClientsController(DatamintDbContext db, IAuditService audit, ICurrentUserService currentUser, IJwtTokenService jwt)
    {
        _db = db;
        _audit = audit;
        _currentUser = currentUser;
        _jwt = jwt;
    }

    [HttpGet]
    public async Task<IActionResult> GetClients([FromQuery] OAuthClientFilterDto filter, CancellationToken ct)
    {
        var query = _db.OAuthClients.Include(c => c.RedirectUris).Include(c => c.CreatedByUser).AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim();
            query = query.Where(c => c.Name.Contains(s) || c.ClientId.Contains(s));
        }
        if (filter.IsEnabled is not null) query = query.Where(c => c.IsEnabled == filter.IsEnabled);
        if (!string.IsNullOrWhiteSpace(filter.GrantType))
        {
            var flag = OAuthGrantTypeMapper.ToFlags(new[] { filter.GrantType });
            query = query.Where(c => (c.GrantTypes & flag) == flag);
        }

        var desc = !string.Equals(filter.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        query = filter.SortBy?.ToLowerInvariant() switch
        {
            "name" => desc ? query.OrderByDescending(c => c.Name) : query.OrderBy(c => c.Name),
            _ => desc ? query.OrderByDescending(c => c.CreatedAtUtc) : query.OrderBy(c => c.CreatedAtUtc),
        };

        var total = await query.CountAsync(ct);
        var items = await query.Skip((filter.Page - 1) * filter.PageSize).Take(filter.PageSize)
            .Select(c => new OAuthClientListItemDto(c.Id, c.ClientId, c.Name, c.LogoUrl, c.IsConfidential, c.IsEnabled,
                OAuthGrantTypeMapper.ToList(c.GrantTypes), c.RedirectUris.Count, c.CreatedAtUtc, c.CreatedByUser != null ? c.CreatedByUser.Email : null))
            .ToListAsync(ct);

        return Ok(new { success = true, items, total, filter.Page, filter.PageSize });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetClient(Guid id, CancellationToken ct)
    {
        var client = await FindWithDetailsAsync(id, ct);
        if (client is null) return NotFound(new { success = false, message = "OAuth client not found." });
        return Ok(new { success = true, client = ToDetailDto(client) });
    }

    [HttpPost]
    public async Task<IActionResult> CreateClient(CreateOAuthClientRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { success = false, message = "Name is required." });

        var grantTypes = OAuthGrantTypeMapper.ToFlags(dto.GrantTypes);
        if (grantTypes == OAuthGrantTypes.None)
            return BadRequest(new { success = false, message = "Select at least one grant type." });
        if (grantTypes.HasFlag(OAuthGrantTypes.ClientCredentials) && !dto.IsConfidential)
            return BadRequest(new { success = false, message = "Only a confidential client can use the client_credentials grant." });

        var redirectUriError = ValidateRedirectUris(dto.RedirectUris, grantTypes);
        if (redirectUriError is not null) return BadRequest(new { success = false, message = redirectUriError });

        var scopes = await LoadScopesAsync(dto.ScopeNames, ct);
        if (scopes is null) return BadRequest(new { success = false, message = "One or more scopes don't exist or are disabled." });

        var accessLifetime = Math.Clamp(dto.AccessTokenLifetimeMinutes, MinAccessTokenMinutes, MaxAccessTokenMinutes);
        var refreshLifetime = Math.Clamp(dto.RefreshTokenLifetimeDays, MinRefreshTokenDays, MaxRefreshTokenDays);

        string? rawSecret = null;
        var client = new OAuthClient
        {
            ClientId = Guid.NewGuid().ToString("N"),
            Name = dto.Name.Trim(),
            LogoUrl = string.IsNullOrWhiteSpace(dto.LogoUrl) ? null : dto.LogoUrl.Trim(),
            IsConfidential = dto.IsConfidential,
            RequireConsent = dto.RequireConsent,
            GrantTypes = grantTypes,
            AccessTokenLifetimeMinutes = accessLifetime,
            RefreshTokenLifetimeDays = refreshLifetime,
            IsEnabled = true,
            CreatedByUserId = _currentUser.UserId,
            RedirectUris = dto.RedirectUris.Select(u => new OAuthRedirectUri { Uri = u.Trim() }).ToList(),
            Scopes = scopes
        };

        if (dto.IsConfidential)
        {
            rawSecret = _jwt.GenerateRefreshToken();
            client.ClientSecretHash = BCrypt.Net.BCrypt.HashPassword(rawSecret);
        }

        _db.OAuthClients.Add(client);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ClientCreated", _currentUser.UserId, "OAuthClient", client.Id.ToString(),
            JsonSerializer.Serialize(new { client.Name, client.ClientId, client.IsConfidential }), ct: ct);

        return Ok(new
        {
            success = true,
            client = ToDetailDto(client),
            secret = rawSecret is null ? null : new OAuthClientSecretRevealDto(client.ClientId, rawSecret)
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateClient(Guid id, UpdateOAuthClientRequestDto dto, CancellationToken ct)
    {
        var client = await FindWithDetailsAsync(id, ct);
        if (client is null) return NotFound(new { success = false, message = "OAuth client not found." });
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { success = false, message = "Name is required." });

        var grantTypes = OAuthGrantTypeMapper.ToFlags(dto.GrantTypes);
        if (grantTypes == OAuthGrantTypes.None)
            return BadRequest(new { success = false, message = "Select at least one grant type." });
        if (grantTypes.HasFlag(OAuthGrantTypes.ClientCredentials) && !client.IsConfidential)
            return BadRequest(new { success = false, message = "Only a confidential client can use the client_credentials grant." });

        var redirectUriError = ValidateRedirectUris(dto.RedirectUris, grantTypes);
        if (redirectUriError is not null) return BadRequest(new { success = false, message = redirectUriError });

        var scopes = await LoadScopesAsync(dto.ScopeNames, ct);
        if (scopes is null) return BadRequest(new { success = false, message = "One or more scopes don't exist or are disabled." });

        var previousName = client.Name;

        client.Name = dto.Name.Trim();
        client.LogoUrl = string.IsNullOrWhiteSpace(dto.LogoUrl) ? null : dto.LogoUrl.Trim();
        client.RequireConsent = dto.RequireConsent;
        client.GrantTypes = grantTypes;
        client.AccessTokenLifetimeMinutes = Math.Clamp(dto.AccessTokenLifetimeMinutes, MinAccessTokenMinutes, MaxAccessTokenMinutes);
        client.RefreshTokenLifetimeDays = Math.Clamp(dto.RefreshTokenLifetimeDays, MinRefreshTokenDays, MaxRefreshTokenDays);

        client.RedirectUris.Clear();
        foreach (var uri in dto.RedirectUris) client.RedirectUris.Add(new OAuthRedirectUri { OAuthClientId = client.Id, Uri = uri.Trim() });

        client.Scopes.Clear();
        foreach (var s in scopes) client.Scopes.Add(s);

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ClientUpdated", _currentUser.UserId, "OAuthClient", client.Id.ToString(),
            JsonSerializer.Serialize(new { from = previousName, to = client.Name }), ct: ct);

        return Ok(new { success = true, client = ToDetailDto(client) });
    }

    [HttpPut("{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleActive(Guid id, CancellationToken ct)
    {
        var client = await _db.OAuthClients.FindAsync(new object[] { id }, ct);
        if (client is null) return NotFound(new { success = false, message = "OAuth client not found." });

        client.IsEnabled = !client.IsEnabled;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(client.IsEnabled ? "OAuth.ClientEnabled" : "OAuth.ClientDisabled", _currentUser.UserId, "OAuthClient", client.Id.ToString(), ct: ct);

        return Ok(new { success = true, isEnabled = client.IsEnabled });
    }

    /// <summary>The old secret stops working the moment this runs - it's replaced, not
    /// supplemented. Returned exactly once, same as at creation.</summary>
    [HttpPost("{id:guid}/regenerate-secret")]
    public async Task<IActionResult> RegenerateSecret(Guid id, CancellationToken ct)
    {
        var client = await _db.OAuthClients.FindAsync(new object[] { id }, ct);
        if (client is null) return NotFound(new { success = false, message = "OAuth client not found." });
        if (!client.IsConfidential) return BadRequest(new { success = false, message = "Public clients don't have a secret." });

        var rawSecret = _jwt.GenerateRefreshToken();
        client.ClientSecretHash = BCrypt.Net.BCrypt.HashPassword(rawSecret);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ClientSecretRegenerated", _currentUser.UserId, "OAuthClient", client.Id.ToString(), ct: ct);

        return Ok(new { success = true, secret = new OAuthClientSecretRevealDto(client.ClientId, rawSecret) });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteClient(Guid id, CancellationToken ct)
    {
        var client = await _db.OAuthClients.FindAsync(new object[] { id }, ct);
        if (client is null) return NotFound(new { success = false, message = "OAuth client not found." });

        client.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.ClientDeleted", _currentUser.UserId, "OAuthClient", client.Id.ToString(), client.Name, ct: ct);

        return Ok(new { success = true });
    }

    private Task<OAuthClient?> FindWithDetailsAsync(Guid id, CancellationToken ct) =>
        _db.OAuthClients.Include(c => c.RedirectUris).Include(c => c.Scopes).Include(c => c.CreatedByUser)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    private async Task<List<OAuthScope>?> LoadScopesAsync(List<string> names, CancellationToken ct)
    {
        if (names.Count == 0) return new List<OAuthScope>();
        var distinct = names.Distinct(StringComparer.Ordinal).ToList();
        var scopes = await _db.OAuthScopes.Where(s => distinct.Contains(s.Name) && s.IsEnabled).ToListAsync(ct);
        return scopes.Count == distinct.Count ? scopes : null;
    }

    private static string? ValidateRedirectUris(List<string> uris, OAuthGrantTypes grantTypes)
    {
        if (grantTypes.HasFlag(OAuthGrantTypes.AuthorizationCode) && uris.Count == 0)
            return "At least one redirect URI is required for the authorization_code grant.";

        foreach (var raw in uris)
        {
            if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var uri) || (uri.Scheme != "https" && uri.Scheme != "http"))
                return $"'{raw}' isn't a valid absolute URL.";
            if (!string.IsNullOrEmpty(uri.Fragment))
                return $"'{raw}' can't contain a fragment.";
            var isLoopback = uri.IsLoopback;
            if (uri.Scheme == "http" && !isLoopback)
                return $"'{raw}' must use https (only localhost/loopback may use http).";
        }
        return null;
    }

    private static OAuthClientDetailDto ToDetailDto(OAuthClient c) => new(
        c.Id, c.ClientId, c.Name, c.LogoUrl, c.IsConfidential, c.RequireConsent, c.IsEnabled,
        OAuthGrantTypeMapper.ToList(c.GrantTypes), c.RedirectUris.Select(r => r.Uri).ToList(),
        c.Scopes.Select(s => s.Name).ToList(), c.AccessTokenLifetimeMinutes, c.RefreshTokenLifetimeDays,
        c.CreatedAtUtc, c.CreatedByUser?.Email);
}
