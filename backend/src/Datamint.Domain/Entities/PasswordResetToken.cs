namespace Datamint.Domain.Entities;

/// <summary>Mirrors RefreshToken: stored hashed, single-use, short-lived.</summary>
public class PasswordResetToken : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string Token { get; set; } = default!;
    public DateTime ExpiresAtUtc { get; set; }
    public bool Used { get; set; }
}
