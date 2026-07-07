using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// One uploaded PDF. A document can have many pages and, once processed,
/// many extracted key/value fields (optionally scoped to a page).
/// </summary>
public class Document : BaseEntity
{
    public Guid? UserId { get; set; }               // nullable: anonymous free-tier uploads before login
    public ApplicationUser? User { get; set; }
    public string? UploaderIpAddress { get; set; }  // anonymous free-tier limit is enforced against this server-side (client-reported counters can't be trusted)

    public string OriginalFileName { get; set; } = default!;
    public string StoredFilePath { get; set; } = default!;
    public long FileSizeBytes { get; set; }
    public int PageCount { get; set; }
    public bool RequiresOcr { get; set; }            // true when the PDF has no extractable text layer
    public DocumentStatus Status { get; set; } = DocumentStatus.Uploaded;
    public string? FailureReason { get; set; }

    // "Dynamic" (default): AI decides which fields exist. "Formatted": caller supplied
    // an exact list of field names up front (RequestedFields, comma-separated) and the
    // AI extracts only those, in that order, null for anything not found.
    public string ExtractionMode { get; set; } = "Dynamic";
    public string? RequestedFields { get; set; }

    public ICollection<DocumentPage> Pages { get; set; } = new List<DocumentPage>();
    public ICollection<ExtractedField> ExtractedFields { get; set; } = new List<ExtractedField>();
}
