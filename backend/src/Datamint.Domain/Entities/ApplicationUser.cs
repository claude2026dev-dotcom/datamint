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
    public bool IsEmailVerified { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAtUtc { get; set; }

    // Free-tier usage tracking (per your rule: 2 free PDF uploads before requiring login/plan)
    public int FreeUploadsUsed { get; set; } = 0;

    public ICollection<Document> Documents { get; set; } = new List<Document>();
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
