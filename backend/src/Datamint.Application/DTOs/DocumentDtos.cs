namespace Datamint.Application.DTOs;

public record PdfPageTextDto(int PageNumber, string Text, bool UsedOcr);

public record PdfTextExtractionResultDto(int PageCount, bool RequiredOcr, List<PdfPageTextDto> Pages);

public record ExtractedFieldDto(string Key, string? Value, int? PageNumber);

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

public record ExtractedFieldEditDto(Guid Id, string FieldKey, string OriginalFieldKey, string? FieldValue, int? PageNumber, bool WasEditedByUser);

public record DocumentDetailDto(
    Guid Id,
    string OriginalFileName,
    int PageCount,
    bool RequiresOcr,
    string Status,
    List<ExtractedFieldEditDto> Fields);

public record UpdateFieldRequestDto(Guid FieldId, string? NewValue, string? NewKey = null);

public record SendEmailRequestDto(Guid DocumentId, string ToAddress, string? Message);

// ExportMode: "SingleSheet" (default - one combined sheet, rows=documents), "MultipleSheets"
// (one .xlsx, one tab per document), or "SeparateFiles" (a .zip with one .xlsx per document).
public record BatchDocumentIdsRequestDto(List<Guid> DocumentIds, string ExportMode = "SingleSheet");

public record BatchSendEmailRequestDto(List<Guid> DocumentIds, string ToAddress, string ExportMode = "SingleSheet");
