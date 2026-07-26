namespace Datamint.Domain.Entities;

/// <summary>
/// An assignable OAuth2 permission (e.g. "documents.read") that a client can request and a
/// user can be shown on the consent screen. Deliberately separate from ApplicationUser.Role
/// ("User"/"Admin") - roles gate the admin panel itself, scopes gate what an OAuth-issued token
/// can be used for once minted, which is the standard OAuth2 permission model.
/// </summary>
public class OAuthScope : BaseEntity
{
    public string Name { get; set; } = default!;
    public string DisplayName { get; set; } = default!;
    public string? Description { get; set; }

    /// <summary>Pre-checked when building a new client's scope list in the admin UI - a
    /// convenience default, not an automatic grant.</summary>
    public bool IsDefault { get; set; }

    public bool IsEnabled { get; set; } = true;

    public ICollection<OAuthClient> Clients { get; set; } = new List<OAuthClient>();
}
