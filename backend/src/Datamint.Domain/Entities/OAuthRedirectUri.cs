namespace Datamint.Domain.Entities;

/// <summary>
/// One whitelisted callback URL for an OAuthClient. Deliberately NOT a BaseEntity - it's a pure
/// value row with no independent lifecycle or audit-tracking need (it lives and dies with its
/// client, see OAuthEntityConfigurations' cascade-delete config), the same reasoning already
/// applied to RefreshToken/PasswordResetToken elsewhere in this codebase.
///
/// /oauth/authorize and /oauth/token both validate the caller's redirect_uri against this list
/// with an EXACT string match (RFC 6749 §3.1.2.3) - prefix/wildcard matching is the classic
/// redirect_uri bypass and is never used here.
/// </summary>
public class OAuthRedirectUri
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OAuthClientId { get; set; }
    public OAuthClient OAuthClient { get; set; } = default!;
    public string Uri { get; set; } = default!;
}
