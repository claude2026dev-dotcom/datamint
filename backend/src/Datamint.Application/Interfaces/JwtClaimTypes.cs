namespace Datamint.Application.Interfaces;

/// <summary>Shared claim-type name so the token issuer (JwtTokenService) and the
/// per-request validator (Program.cs's OnTokenValidated) always agree on it.</summary>
public static class JwtClaimTypes
{
    public const string SecurityStamp = "security_stamp";

    /// <summary>Present on every OAuth2-issued access token (both client_credentials and
    /// authorization_code flavors) - Program.cs's OnTokenValidated uses its presence to run a
    /// live "is this OAuthClient still enabled" check, the same live-revocation philosophy
    /// already applied to SecurityStamp for regular user tokens.</summary>
    public const string OAuthClientId = "client_id";

    /// <summary>Space-separated granted scopes (RFC 6749 §3.3 convention), present on every
    /// OAuth2-issued access token.</summary>
    public const string OAuthScope = "scope";
}
