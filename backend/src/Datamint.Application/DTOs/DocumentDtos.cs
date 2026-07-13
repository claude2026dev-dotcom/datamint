namespace Datamint.Application.DTOs;

public record PdfPageTextDto(int PageNumber, string Text, bool UsedOcr);

public record PdfTextExtractionResultDto(int PageCount, bool RequiredOcr, List<PdfPageTextDto> Pages);

public record ExtractedFieldDto(string Key, string? Value, int? PageNumber, string? SemanticType = null, string? SectionLabel = null);

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

public record UpdateFieldRequestDto(Guid FieldId, string? NewValue, string? NewKey = null);

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
