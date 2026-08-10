namespace Datamint.Domain.Entities;

/// <summary>
/// A short-lived (~2 minute), single-use authorization code minted by
/// POST /oauth/authorize/complete and redeemed by POST /oauth/token (grant_type=authorization_code).
/// Not a BaseEntity - ephemeral by design, same shape/reasoning as PasswordResetToken.
///
/// RedirectUri is stored and re-checked byte-for-byte against the redirect_uri presented at
/// token-exchange time (RFC 6749 §4.1.3) - stops a leaked code being redeemed against a
/// different redirect_uri registered to the same client. CodeChallenge/CodeChallengeMethod
/// implement PKCE (RFC 7636) - S256 is the only method this app accepts; "plain" is never
/// supported. Used/UsedAtUtc are set atomically in the same transaction that issues tokens.
/// A code presented again well after that is treated as evidence of theft, not just an expired
/// code - see OAuthService.ExchangeAuthorizationCodeAsync for the resulting refresh-token
/// revocation. A second presentation within a few seconds of the first, with the exact same
/// redirect_uri/code_verifier, is instead treated as a harmless client-side duplicate request
/// (retried by the browser/OAuth client) and replays the original token response from a
/// short-lived in-memory cache rather than punishing it - see the same method.
/// </summary>
public class OAuthAuthorizationCode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string CodeHash { get; set; } = default!;
    public Guid OAuthClientId { get; set; }
    public OAuthClient OAuthClient { get; set; } = default!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string RedirectUri { get; set; } = default!;
    public string Scope { get; set; } = default!;
    public string CodeChallenge { get; set; } = default!;
    public string CodeChallengeMethod { get; set; } = default!;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public bool Used { get; set; }
    public DateTime? UsedAtUtc { get; set; }
}
