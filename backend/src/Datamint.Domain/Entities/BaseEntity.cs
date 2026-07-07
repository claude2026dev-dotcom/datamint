namespace Datamint.Domain.Entities;

/// <summary>
/// Common audit fields shared by every entity. Keeping this here means
/// every table gets created/updated tracking for free without repeating code.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
    public bool IsDeleted { get; set; } = false; // soft delete everywhere
}
