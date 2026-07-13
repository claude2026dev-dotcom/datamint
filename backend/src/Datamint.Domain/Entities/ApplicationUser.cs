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

    // Just the stored file's name (a GUID + extension, e.g. "3f9e...-a1b2.jpg"), not a full
    // URL - AuthController builds the actual /api/auth/avatar/{fileName} URL on the way out,
    // so switching hosts/domains never means a stale absolute URL baked into old rows. Null
    // when the user has no custom picture (frontend falls back to initials, as it always did).
    public string? AvatarFileName { get; set; }

    // Set the moment a user deactivates their own account (or an admin deletes one) -
    // null while active, and cleared back to null on reactivation. Drives the
    // DeactivationGraceDays window: logging back in (or an admin reactivating) before
    // this + DeactivationGraceDays restores the account; AccountPurgeService hard-deletes
    // the user's documents and anonymizes this row once that window has passed.
    public DateTime? DeactivatedAtUtc { get; set; }

    // Null until AccountPurgeService actually anonymizes this row - lets the purge job's
    // query tell "deactivated, still in the grace window or already reactivated" apart
    // from "already purged, don't touch again" without having to string-match the
    // (by-then-anonymized) Email column.
    public DateTime? PurgedAtUtc { get; set; }

    // Single source of truth for how long a deactivated account can still be reactivated
    // (by the user logging back in, or an admin) before AccountPurgeService erases it.
    public const int DeactivationGraceDays = 30;

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
