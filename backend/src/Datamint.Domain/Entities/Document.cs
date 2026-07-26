using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// One uploaded file (PDF or image). A document can have many pages and, once processed,
/// many extracted key/value fields (optionally scoped to a page). An image is always
/// exactly one page.
/// </summary>
public class Document : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;

    // Every file in the same upload request shares this value (assigned once by
    // DocumentsController.Upload); a lone/single-file upload just gets a value nobody
    // else shares. Lets the frontend's "My documents" list group files that were
    // uploaded together back into one bulk entry instead of listing them separately.
    public Guid UploadBatchId { get; set; } = Guid.NewGuid();

    public string OriginalFileName { get; set; } = default!;
    public string StoredFilePath { get; set; } = default!;
    public string ContentType { get; set; } = default!; // "application/pdf" or an image/* type
    public long FileSizeBytes { get; set; }
    public int PageCount { get; set; } // always 1 for an image
    public DocumentStatus Status { get; set; } = DocumentStatus.Uploaded;
    public string? FailureReason { get; set; }

    // "Dynamic" (default): AI decides which fields exist. "Formatted": caller supplied
    // an exact list of field names up front (RequestedFields, comma-separated) and the
    // AI extracts only those, in that order, null for anything not found.
    public string ExtractionMode { get; set; } = "Dynamic";
    public string? RequestedFields { get; set; }

    // The Extraction Tier (AI provider/model/prompt-customization) actually used for this
    // document, resolved once at processing time from the user's active plan and frozen here -
    // re-processing later should never silently pick up a since-changed tier for an old result.
    public Guid? ExtractionTierId { get; set; }
    public ExtractionTier? ExtractionTier { get; set; }

    public ICollection<DocumentPage> Pages { get; set; } = new List<DocumentPage>();
    public ICollection<ExtractedField> ExtractedFields { get; set; } = new List<ExtractedField>();
}
