namespace Datamint.Domain.Entities;

public class EmailLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public string ToAddress { get; set; } = default!;
    public string Subject { get; set; } = default!;
    public bool IsSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public Guid? DocumentId { get; set; }
}
