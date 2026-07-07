namespace Datamint.Domain.Entities;

public class DocumentPage : BaseEntity
{
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public int PageNumber { get; set; }
    public string? RawText { get; set; }             // extracted via text layer or OCR
    public bool UsedOcr { get; set; }
}
