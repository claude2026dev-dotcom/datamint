namespace Datamint.Application.DTOs;

public record PdfPageTextDto(int PageNumber, string Text, bool UsedOcr);

public record PdfTextExtractionResultDto(int PageCount, bool RequiredOcr, List<PdfPageTextDto> Pages);

/// <param name="Priority">AI-assigned importance rank (lower = more important/shown first) -
/// entirely the model's own judgment call per document, never a hardcoded rule, so a field/
/// section central to one document type (e.g. a final total) can rank differently than the
/// "same" label would in a document where it's incidental. Null (pre-priority rows, or a parse
/// fallback) sorts last.</param>
public record ExtractedFieldDto(string Key, string? Value, int? PageNumber, string? SemanticType = null, string? SectionLabel = null, int? Priority = null);

public record AiExtractionResultDto(List<ExtractedFieldDto> Fields, bool Success, string? ErrorMessage);

public record DocumentSummaryDto(
    Guid Id,
    string OriginalFileName,
    int PageCount,
    bool RequiresOcr,
    string Status,
    DateTime CreatedAtUtc,
    string? FailureReason = null,
    long FileSizeBytes = 0,
    Guid UploadBatchId = default);

public record ExtractedFieldEditDto(Guid Id, string FieldKey, string OriginalFieldKey, string? FieldValue, int? PageNumber, bool WasEditedByUser,
    string SemanticType, string SectionLabel, bool IncludeInExport, int SortOrder);

public record DocumentDetailDto(
    Guid Id,
    string OriginalFileName,
    int PageCount,
    bool RequiresOcr,
    string Status,
    List<ExtractedFieldEditDto> Fields);

public record UpdateFieldRequestDto(Guid FieldId, string? NewValue, string? NewKey = null, bool? IncludeInExport = null);

public record PeekFileResultDto(string FileName, int PageCount, bool RequiresOcr);

public record PeekResultDto(List<PeekFileResultDto> Files);

/// <param name="FileIndex">Index into the same "files" form-array the upload request carries -
/// matches a selection back to the file it applies to.</param>
/// <param name="Pages">A spec string like "1-3,5" - a page-count-aware caller typically gets this
/// from /peek first. Null/empty (or the entry being absent entirely) means "all pages", so the
/// common no-selection path is unaffected.</param>
public record PageSelectionDto(int FileIndex, string? Pages);

/// <param name="Fields">Every field of the document, in the drop's resulting order - the whole
/// list is renumbered on any single move, not just the dragged field, so SortOrder never gaps
/// or collides across repeated reorders.</param>
public record ReorderFieldDto(Guid FieldId, string SectionLabel, int SortOrder);

public record ReorderFieldsRequestDto(List<ReorderFieldDto> Fields);

public record RenameSectionRequestDto(string OldLabel, string NewLabel);

public enum ExportFormat { Excel, Json }

// RowsPerField: one row per field (today's default single-document layout, and each
// tab/file in MultipleSheets/SeparateFiles). ColumnsPerField: one column per field key,
// one row per document (today's implicit "SingleSheet" batch layout) - orthogonal to
// ExportMode below, which only controls how many sheets/files a batch produces.
public enum ExportLayout { RowsPerField, ColumnsPerField }

/// <param name="IncludedFieldIds">Null = respect each field's own IncludeInExport flag (the
/// normal case - set while reviewing). Non-null = an explicit override for callers that want
/// a specific subset regardless of the saved per-field flags.</param>
/// <param name="IncludedDocumentIds">Batch-only. Null = every document in the request.</param>
public record ExportOptionsDto(
    ExportFormat Format = ExportFormat.Excel,
    ExportLayout Layout = ExportLayout.RowsPerField,
    List<Guid>? IncludedFieldIds = null,
    List<Guid>? IncludedDocumentIds = null);

public record SendEmailRequestDto(Guid DocumentId, string ToAddress, string? Message, ExportOptionsDto? Options = null);

// ExportMode: "SingleSheet" (default - one combined sheet, rows=documents), "MultipleSheets"
// (one .xlsx, one tab per document), or "SeparateFiles" (a .zip with one .xlsx per document).
// Ignored entirely when Options.Format is Json (JSON always returns one structured payload).
public record BatchDocumentIdsRequestDto(List<Guid> DocumentIds, string ExportMode = "SingleSheet", ExportOptionsDto? Options = null);

public record BatchSendEmailRequestDto(List<Guid> DocumentIds, string ToAddress, string ExportMode = "SingleSheet", ExportOptionsDto? Options = null);

public record ExportResultDto(byte[] Data, string ContentType, string FileName);
