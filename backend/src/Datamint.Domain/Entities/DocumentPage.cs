namespace Datamint.Domain.Entities;

public class DocumentPage : BaseEntity
{
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public int PageNumber { get; set; }
    public string? RawText { get; set; } // extracted via the PDF text layer; null for an image page
    public bool IsSelectedForExtraction { get; set; } = true; // user can deselect pages before extraction
}
