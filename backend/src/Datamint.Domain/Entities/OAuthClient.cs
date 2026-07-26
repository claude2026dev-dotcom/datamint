using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// A registered OAuth2 client (third-party app, service, or the built-in Swagger UI client
/// seeded by DbSeeder). Confidential clients (IsConfidential = true) hold a hashed secret and
/// may use the ClientCredentials grant; public clients (e.g. a browser-based tool like Swagger)
/// never hold a secret - PKCE is what proves their authorization_code exchanges are legitimate
/// instead. This distinction is enforced both here (ClientSecretHash must be null for a public
/// client) and at token-exchange time (OAuthService rejects ClientCredentials for a public
/// client outright, since there'd be nothing to authenticate with).
/// </summary>
public class OAuthClient : BaseEntity
{
    /// <summary>Stable, human-assignable identifier distinct from Id - lets the built-in
    /// Swagger client keep the same ClientId ("datamint-swagger-ui") across every environment
    /// and re-seed, whereas Id (a fresh Guid per insert) would differ per database.</summary>
    public string ClientId { get; set; } = default!;
    public string? ClientSecretHash { get; set; }
    public string Name { get; set; } = default!;
    public string? LogoUrl { get; set; }
    public bool IsConfidential { get; set; }

    /// <summary>Off for the built-in Swagger client (first-party, no need to ask a developer
    /// to "consent" to their own API tooling); on by default for anything else, since granting
    /// scopes with zero visibility into what's being authorized is exactly the gap a real
    /// OAuth2 consent step exists to close.</summary>
    public bool RequireConsent { get; set; } = true;

    public OAuthGrantTypes GrantTypes { get; set; }

    public int AccessTokenLifetimeMinutes { get; set; } = 30;
    public int RefreshTokenLifetimeDays { get; set; } = 30;

    public bool IsEnabled { get; set; } = true;

    public Guid? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }

    public ICollection<OAuthRedirectUri> RedirectUris { get; set; } = new List<OAuthRedirectUri>();
    public ICollection<OAuthScope> Scopes { get; set; } = new List<OAuthScope>();
}
