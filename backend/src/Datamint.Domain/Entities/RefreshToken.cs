namespace Datamint.Domain.Entities;

public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string Token { get; set; } = default!;
    public DateTime ExpiresAtUtc { get; set; }
    public bool Revoked { get; set; }
}
