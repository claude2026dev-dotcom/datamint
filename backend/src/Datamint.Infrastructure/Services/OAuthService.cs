using System.Security.Cryptography;
using System.Text;
using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// OAuth2 protocol logic (RFC 6749 authorization_code + client_credentials + refresh_token,
/// PKCE per RFC 7636). See IOAuthService for the per-method contract; the security reasoning
/// behind each check below (open-redirect guard, redirect_uri rebinding, code/refresh-token
/// reuse-detection, public-client client_credentials denial) came out of an explicit design
/// review against RFC 6749/7636 before this was implemented - these aren't incidental checks,
/// each one closes a specific, named class of OAuth2 vulnerability.
/// </summary>
public class OAuthService : IOAuthService
{
    private static readonly TimeSpan AuthorizationCodeLifetime = TimeSpan.FromMinutes(2);

    // Some OAuth clients (Swagger UI's bundled popup flow among them) are known to occasionally
    // double-dispatch the token request for a single authorize completion. A duplicate arriving
    // within this window, with the exact same redirect_uri/code_verifier as the original, is
    // replayed from cache rather than treated as theft - see ExchangeAuthorizationCodeAsync.
    private static readonly TimeSpan CodeReplayGraceWindow = TimeSpan.FromSeconds(15);

    private readonly DatamintDbContext _db;
    private readonly IOAuthClientRepository _clients;
    private readonly IJwtTokenService _jwt;
    private readonly IAuditService _audit;
    private readonly IMemoryCache _cache;

    public OAuthService(DatamintDbContext db, IOAuthClientRepository clients, IJwtTokenService jwt, IAuditService audit, IMemoryCache cache)
    {
        _db = db;
        _clients = clients;
        _jwt = jwt;
        _audit = audit;
        _cache = cache;
    }

    public async Task<OAuthClient?> FindClientForRedirectAsync(string clientId, string redirectUri, CancellationToken ct = default)
    {
        var client = await _clients.GetByClientIdAsync(clientId, ct);
        if (client is null || !client.IsEnabled) return null;

        // Exact match only (RFC 6749 §3.1.2.3) - prefix/wildcard matching is the classic
        // redirect_uri bypass and is never accepted here.
        var isRegistered = client.RedirectUris.Any(r => string.Equals(r.Uri, redirectUri, StringComparison.Ordinal));
        return isRegistered ? client : null;
    }

    public Task<string> ResolveScopeAsync(OAuthClient client, string? requestedScope, CancellationToken ct = default)
    {
        var allowedNames = client.Scopes.Where(s => s.IsEnabled).Select(s => s.Name).ToHashSet(StringComparer.Ordinal);

        if (string.IsNullOrWhiteSpace(requestedScope))
        {
            var defaults = client.Scopes.Where(s => s.IsEnabled && s.IsDefault).Select(s => s.Name);
            return Task.FromResult(string.Join(' ', defaults));
        }

        var requested = requestedScope.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var name in requested)
        {
            if (!allowedNames.Contains(name))
                throw new OAuthException("invalid_scope", $"Scope '{name}' is not allowed for this client.", 400);
        }
        return Task.FromResult(string.Join(' ', requested.Distinct(StringComparer.Ordinal)));
    }

    public async Task<List<OAuthScope>> GetScopesAsync(IEnumerable<string> names, CancellationToken ct = default)
    {
        var nameSet = names.ToHashSet(StringComparer.Ordinal);
        if (nameSet.Count == 0) return new List<OAuthScope>();
        return await _db.OAuthScopes.Where(s => nameSet.Contains(s.Name)).ToListAsync(ct);
    }

    public async Task<OAuthAuthorizeCompleteResponseDto> CompleteAuthorizeAsync(Guid userId, OAuthAuthorizeCompleteRequestDto request, CancellationToken ct = default)
    {
        // Defense in depth: GET /oauth/authorize already validated client/redirect once before
        // ever showing the login page, but a tampered form post shouldn't be trusted blindly.
        var client = await FindClientForRedirectAsync(request.ClientId, request.RedirectUri, ct)
            ?? throw new OAuthException("invalid_request", "Unknown client or redirect_uri.", 400);

        if (!request.Consented)
            return new OAuthAuthorizeCompleteResponseDto(BuildRedirect(request.RedirectUri, ("error", "access_denied"), ("state", request.State)));

        if (!string.Equals(request.CodeChallengeMethod, "S256", StringComparison.Ordinal) || string.IsNullOrWhiteSpace(request.CodeChallenge))
            return new OAuthAuthorizeCompleteResponseDto(BuildRedirect(request.RedirectUri, ("error", "invalid_request"), ("state", request.State)));

        string scope;
        try
        {
            scope = await ResolveScopeAsync(client, request.Scope, ct);
        }
        catch (OAuthException)
        {
            return new OAuthAuthorizeCompleteResponseDto(BuildRedirect(request.RedirectUri, ("error", "invalid_scope"), ("state", request.State)));
        }

        var rawCode = _jwt.GenerateRefreshToken(); // reused as a generic cryptographically-random opaque token generator
        var code = new OAuthAuthorizationCode
        {
            CodeHash = _jwt.HashToken(rawCode),
            OAuthClientId = client.Id,
            UserId = userId,
            RedirectUri = request.RedirectUri,
            Scope = scope,
            CodeChallenge = request.CodeChallenge,
            CodeChallengeMethod = request.CodeChallengeMethod,
            ExpiresAtUtc = DateTime.UtcNow.Add(AuthorizationCodeLifetime)
        };
        _db.OAuthAuthorizationCodes.Add(code);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.AuthorizationGranted", userId, "OAuthClient", client.Id.ToString(), $"scope={scope}", ct: ct);

        return new OAuthAuthorizeCompleteResponseDto(BuildRedirect(request.RedirectUri, ("code", rawCode), ("state", request.State)));
    }

    public Task<OAuthTokenResponseDto> ExchangeTokenAsync(OAuthTokenRequestDto request, CancellationToken ct = default) => request.GrantType switch
    {
        "authorization_code" => ExchangeAuthorizationCodeAsync(request, ct),
        "client_credentials" => ExchangeClientCredentialsAsync(request, ct),
        "refresh_token" => ExchangeRefreshTokenAsync(request, ct),
        _ => throw new OAuthException("unsupported_grant_type", null, 400)
    };

    private async Task<OAuthTokenResponseDto> ExchangeAuthorizationCodeAsync(OAuthTokenRequestDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.RedirectUri) ||
            string.IsNullOrWhiteSpace(request.ClientId) || string.IsNullOrWhiteSpace(request.CodeVerifier))
            throw new OAuthException("invalid_request", "Missing required parameters.", 400);

        var client = await _clients.GetByClientIdAsync(request.ClientId, ct)
            ?? throw new OAuthException("invalid_client", null, 401);
        if (!client.IsEnabled) throw new OAuthException("invalid_client", null, 401);

        AuthenticateClient(client, request.ClientSecret);

        var codeHash = _jwt.HashToken(request.Code);
        var code = await _db.OAuthAuthorizationCodes.Include(c => c.User).FirstOrDefaultAsync(c => c.CodeHash == codeHash, ct);

        if (code is null || code.OAuthClientId != client.Id)
            throw new OAuthException("invalid_grant", "Invalid authorization code.", 400);

        if (code.Used)
        {
            // Before assuming theft: a duplicate request for this exact code, arriving within
            // the grace window and presenting the same redirect_uri/code_verifier as the
            // original, is far more likely to be a harmless client-side retry (browsers and
            // OAuth libraries occasionally double-dispatch the token request) than a genuine
            // interception. Replay the cached response instead of revoking a legitimate session.
            if (code.UsedAtUtc is { } usedAt && DateTime.UtcNow - usedAt <= CodeReplayGraceWindow &&
                string.Equals(code.RedirectUri, request.RedirectUri, StringComparison.Ordinal) &&
                VerifyPkce(code.CodeChallenge, code.CodeChallengeMethod, request.CodeVerifier) &&
                _cache.TryGetValue<OAuthTokenResponseDto>(CodeReplayCacheKey(codeHash), out var cached))
            {
                return cached!;
            }

            // Grace window elapsed, mismatched redirect_uri/verifier, or the cached response was
            // already evicted - this really does look like the code being redeemed a second time
            // by someone other than whoever legitimately redeemed it first.
            await RevokeTokensByAuthorizationCodeAsync(code.Id, ct);
            throw new OAuthException("invalid_grant", "This authorization code has already been used.", 400);
        }

        if (code.ExpiresAtUtc < DateTime.UtcNow)
            throw new OAuthException("invalid_grant", "This authorization code has expired.", 400);

        // RFC 6749 §4.1.3 - stops a leaked code being redeemed against a different redirect_uri
        // registered to the same client than the one it was actually issued for.
        if (!string.Equals(code.RedirectUri, request.RedirectUri, StringComparison.Ordinal))
            throw new OAuthException("invalid_grant", "redirect_uri does not match the one used to obtain this code.", 400);

        if (!VerifyPkce(code.CodeChallenge, code.CodeChallengeMethod, request.CodeVerifier))
            throw new OAuthException("invalid_grant", "Invalid code_verifier.", 400);

        code.Used = true;
        code.UsedAtUtc = DateTime.UtcNow;

        var accessToken = _jwt.GenerateOAuthAccessToken(client.ClientId, code.User, code.Scope, client.AccessTokenLifetimeMinutes);

        string? rawRefreshToken = null;
        if (client.GrantTypes.HasFlag(OAuthGrantTypes.RefreshToken))
        {
            rawRefreshToken = _jwt.GenerateRefreshToken();
            _db.OAuthRefreshTokens.Add(new OAuthRefreshToken
            {
                TokenHash = _jwt.HashToken(rawRefreshToken),
                OAuthClientId = client.Id,
                UserId = code.UserId,
                Scope = code.Scope,
                AuthorizationCodeId = code.Id,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(client.RefreshTokenLifetimeDays)
            });
        }

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.TokenIssued", code.UserId, "OAuthClient", client.Id.ToString(), "grant_type=authorization_code", ct: ct);

        var response = new OAuthTokenResponseDto
        {
            AccessToken = accessToken,
            ExpiresIn = client.AccessTokenLifetimeMinutes * 60,
            RefreshToken = rawRefreshToken,
            Scope = code.Scope
        };
        _cache.Set(CodeReplayCacheKey(codeHash), response, CodeReplayGraceWindow);
        return response;
    }

    private static string CodeReplayCacheKey(string codeHash) => $"oauth:code-replay:{codeHash}";

    private async Task<OAuthTokenResponseDto> ExchangeClientCredentialsAsync(OAuthTokenRequestDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ClientId))
            throw new OAuthException("invalid_request", "Missing client_id.", 400);

        var client = await _clients.GetByClientIdAsync(request.ClientId, ct)
            ?? throw new OAuthException("invalid_client", null, 401);

        // A public client has no secret, so there's nothing to authenticate a machine-to-machine
        // call with - client_credentials is only ever valid for a confidential client.
        if (!client.IsEnabled || !client.IsConfidential || !client.GrantTypes.HasFlag(OAuthGrantTypes.ClientCredentials))
            throw new OAuthException("unauthorized_client", "This client is not permitted to use the client_credentials grant.", 400);

        AuthenticateClient(client, request.ClientSecret);

        var scope = await ResolveScopeAsync(client, request.Scope, ct);
        var accessToken = _jwt.GenerateOAuthAccessToken(client.ClientId, user: null, scope, client.AccessTokenLifetimeMinutes);
        await _audit.LogAsync("OAuth.TokenIssued", null, "OAuthClient", client.Id.ToString(), "grant_type=client_credentials", ct: ct);

        return new OAuthTokenResponseDto
        {
            AccessToken = accessToken,
            ExpiresIn = client.AccessTokenLifetimeMinutes * 60,
            RefreshToken = null, // never issued for client_credentials - RFC 6749 §4.4.3
            Scope = scope
        };
    }

    private async Task<OAuthTokenResponseDto> ExchangeRefreshTokenAsync(OAuthTokenRequestDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            throw new OAuthException("invalid_request", "Missing refresh_token.", 400);

        var tokenHash = _jwt.HashToken(request.RefreshToken);
        var stored = await _db.OAuthRefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (stored is null)
            throw new OAuthException("invalid_grant", "Invalid refresh token.", 400);

        if (stored.Revoked)
        {
            // A revoked token being replayed is the signature of theft (the legitimate holder
            // already rotated past it) - kill every other token in the same client+user family,
            // not just this one, exactly like a stolen refresh token should be handled.
            await RevokeAllForClientUserAsync(stored.OAuthClientId, stored.UserId, ct);
            throw new OAuthException("invalid_grant", "This refresh token has already been used.", 400);
        }

        // Fetched with IgnoreQueryFilters(), not via Include(t => t.OAuthClient): OAuthClient
        // carries the app's global soft-delete filter, but OAuthRefreshToken doesn't - an
        // eager-loaded navigation from an unfiltered entity to a filtered one comes back null
        // if the client was ever soft-deleted, which would NullReferenceException every check
        // below instead of correctly reporting "this token is dead because its client is gone".
        var client = await _db.OAuthClients.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.Id == stored.OAuthClientId, ct);

        if (client is null || client.IsDeleted || !client.IsEnabled || stored.ExpiresAtUtc < DateTime.UtcNow)
            throw new OAuthException("invalid_grant", "This refresh token is no longer valid.", 400);

        if (!string.IsNullOrWhiteSpace(request.ClientId) && !string.Equals(request.ClientId, client.ClientId, StringComparison.Ordinal))
            throw new OAuthException("invalid_grant", "client_id does not match this refresh token.", 400);

        AuthenticateClient(client, request.ClientSecret);

        stored.Revoked = true;

        var rawNewRefreshToken = _jwt.GenerateRefreshToken();
        _db.OAuthRefreshTokens.Add(new OAuthRefreshToken
        {
            TokenHash = _jwt.HashToken(rawNewRefreshToken),
            OAuthClientId = stored.OAuthClientId,
            UserId = stored.UserId,
            Scope = stored.Scope, // never widens on refresh - RFC 6749 §6
            AuthorizationCodeId = stored.AuthorizationCodeId,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(client.RefreshTokenLifetimeDays)
        });

        var accessToken = _jwt.GenerateOAuthAccessToken(client.ClientId, stored.User, stored.Scope, client.AccessTokenLifetimeMinutes);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("OAuth.TokenRefreshed", stored.UserId, "OAuthClient", stored.OAuthClientId.ToString(), ct: ct);

        return new OAuthTokenResponseDto
        {
            AccessToken = accessToken,
            ExpiresIn = client.AccessTokenLifetimeMinutes * 60,
            RefreshToken = rawNewRefreshToken,
            Scope = stored.Scope
        };
    }

    /// <summary>Public clients (no secret) authenticate authorization_code exchanges via PKCE
    /// alone - nothing to check here. Confidential clients must present a secret that verifies
    /// against the stored BCrypt hash, the same hashing this app already uses for
    /// ApplicationUser.PasswordHash.</summary>
    private static void AuthenticateClient(OAuthClient client, string? providedSecret)
    {
        if (!client.IsConfidential) return;
        if (string.IsNullOrEmpty(providedSecret) || client.ClientSecretHash is null ||
            !BCrypt.Net.BCrypt.Verify(providedSecret, client.ClientSecretHash))
            throw new OAuthException("invalid_client", "Invalid client credentials.", 401);
    }

    private static bool VerifyPkce(string codeChallenge, string codeChallengeMethod, string codeVerifier)
    {
        if (!string.Equals(codeChallengeMethod, "S256", StringComparison.Ordinal)) return false;
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier));
        return string.Equals(Base64UrlEncode(hash), codeChallenge, StringComparison.Ordinal);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private async Task RevokeTokensByAuthorizationCodeAsync(Guid authorizationCodeId, CancellationToken ct)
    {
        var tokens = await _db.OAuthRefreshTokens.Where(t => t.AuthorizationCodeId == authorizationCodeId && !t.Revoked).ToListAsync(ct);
        foreach (var t in tokens) t.Revoked = true;
        if (tokens.Count > 0) await _db.SaveChangesAsync(ct);
    }

    private async Task RevokeAllForClientUserAsync(Guid oauthClientId, Guid userId, CancellationToken ct)
    {
        var tokens = await _db.OAuthRefreshTokens.Where(t => t.OAuthClientId == oauthClientId && t.UserId == userId && !t.Revoked).ToListAsync(ct);
        foreach (var t in tokens) t.Revoked = true;
        if (tokens.Count > 0) await _db.SaveChangesAsync(ct);
    }

    private static string BuildRedirect(string baseUri, params (string Key, string Value)[] pairs)
    {
        var separator = baseUri.Contains('?') ? "&" : "?";
        var query = string.Join("&", pairs.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
        return $"{baseUri}{separator}{query}";
    }
}
