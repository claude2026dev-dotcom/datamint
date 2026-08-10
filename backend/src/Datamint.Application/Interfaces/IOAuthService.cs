using Datamint.Application.DTOs;
using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Owns the OAuth2 protocol logic (RFC 6749 authorization_code + PKCE per RFC 7636, and
/// client_credentials) - everything OAuthController delegates to instead of talking to
/// EF Core directly, matching this app's existing "controllers call services, not DbContext"
/// rule for anything with real business logic behind it (unlike AdminController's simple CRUD,
/// which is thin enough to skip a service layer).
/// </summary>
public interface IOAuthService
{
    /// <summary>Looks up the client and confirms redirectUri is one of its EXACTLY-registered
    /// URIs (RFC 6749 §3.1.2.3 - no prefix/wildcard matching). Returns null for either failure -
    /// the caller (GET /oauth/authorize) must treat null as "unsafe to redirect anywhere" and
    /// render a local error page instead, never bounce the browser to an unverified URI.</summary>
    Task<OAuthClient?> FindClientForRedirectAsync(string clientId, string redirectUri, CancellationToken ct = default);

    /// <summary>Validates the requested scope names are known, enabled, and allowed for this
    /// client; throws OAuthException("invalid_scope") otherwise. An empty/null request resolves
    /// to the client's allowed scopes that are flagged IsDefault. Returns the granted scope as
    /// one space-separated string (RFC 6749 §3.3 convention).</summary>
    Task<string> ResolveScopeAsync(OAuthClient client, string? requestedScope, CancellationToken ct = default);

    /// <summary>Scope names -> full OAuthScope rows (for rendering their DisplayName/Description
    /// on the consent screen), in no particular guaranteed order.</summary>
    Task<List<OAuthScope>> GetScopesAsync(IEnumerable<string> names, CancellationToken ct = default);

    /// <summary>Re-validates client/redirect/scope/PKCE-challenge shape (defense in depth - the
    /// GET /oauth/authorize that preceded this already checked once), then either mints a
    /// single-use authorization code (Consented = true) or returns an access_denied redirect
    /// (Consented = false). Always returns a redirect URL to send the browser to - never throws
    /// for a user-facing "denied" outcome, only for a malformed/tampered request.</summary>
    Task<OAuthAuthorizeCompleteResponseDto> CompleteAuthorizeAsync(Guid userId, OAuthAuthorizeCompleteRequestDto request, CancellationToken ct = default);

    /// <summary>Single entry point for POST /oauth/token - branches internally on
    /// request.GrantType (authorization_code / client_credentials / refresh_token). Throws
    /// OAuthException with an RFC 6749 §5.2 error code on any failure.</summary>
    Task<OAuthTokenResponseDto> ExchangeTokenAsync(OAuthTokenRequestDto request, CancellationToken ct = default);
}
