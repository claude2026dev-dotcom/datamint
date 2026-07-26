namespace Datamint.Domain.Entities;

/// <summary>
/// A refresh token issued to an authorization_code exchange (never to client_credentials -
/// RFC 6749 §4.4.3, re-authenticating with the client secret IS the refresh mechanism for that
/// grant). Not a BaseEntity - same ephemeral, DB-lifetime-only shape as the app's existing
/// RefreshToken, stored hashed via the same IJwtTokenService.HashToken used there.
///
/// Scope is fixed at issuance and never widens on refresh (RFC 6749 §6) - a refresh can narrow
/// what's requested next time but never grant more than the original authorization did.
///
/// AuthorizationCodeId links back to the code that produced this token: if that code is ever
/// replayed after being marked Used, OAuthService revokes the token(s) traceable to it as a
/// theft-response, not just an "invalid_grant". Separately, if a REVOKED refresh token itself
/// gets replayed, that's reuse-detection - OAuthService responds by revoking every other
/// refresh token for that OAuthClientId+UserId pair ("kill the whole family"), since a revoked
/// token being presented again means it was almost certainly stolen and already used by someone
/// else first.
/// </summary>
public class OAuthRefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TokenHash { get; set; } = default!;
    public Guid OAuthClientId { get; set; }
    public OAuthClient OAuthClient { get; set; } = default!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string Scope { get; set; } = default!;
    public Guid? AuthorizationCodeId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public bool Revoked { get; set; }
}
