namespace Datamint.Domain.Entities;

/// <summary>
/// Application user. Supports both email/password (hashed) and Google OAuth
/// (GoogleId populated, PasswordHash null) sign-in in the same table.
/// </summary>
public class ApplicationUser : BaseEntity
{
    public string Email { get; set; } = default!;
    public string? DisplayName { get; set; }
    public string? PasswordHash { get; set; }      // null when the user signed up via Google
    public string? GoogleId { get; set; }           // null when the user signed up via email/password
    public string Role { get; set; } = "User";       // "User" | "Admin"
    // True for exactly one seeded account. Unlike a regular Admin, this account can never be
    // disabled, demoted, or deleted - by itself or by any other admin - so there's always at
    // least one account that can recover access if every other admin gets locked out or deleted.
    public bool IsSuperAdmin { get; set; }
    public bool IsEmailVerified { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAtUtc { get; set; }

    // Embedded in every access token and checked against this value on every
    // request - regenerating it (on password change/reset) invalidates every
    // access token issued before that point immediately, not just at their
    // natural ~30 min expiry or when a refresh is attempted.
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");

    public ICollection<Document> Documents { get; set; } = new List<Document>();
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
