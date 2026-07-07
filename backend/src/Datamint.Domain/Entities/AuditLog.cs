namespace Datamint.Domain.Entities;

/// <summary>
/// Every meaningful action (login, upload, extraction, export, email sent,
/// plan change, admin action) writes one row here so the admin dashboard
/// has a full, queryable trail.
/// </summary>
public class AuditLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string Action { get; set; } = default!;     // e.g. "Document.Upload", "Auth.Login"
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }
    public string? Details { get; set; }               // JSON blob of extra context
    public string? IpAddress { get; set; }
    public bool IsSuccess { get; set; } = true;
}
