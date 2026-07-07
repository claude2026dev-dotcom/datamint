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
    DateTime CreatedAtUtc);

public record ExtractedFieldEditDto(Guid Id, string FieldKey, string? FieldValue, int? PageNumber, bool WasEditedByUser);

public record DocumentDetailDto(
    Guid Id,
    string OriginalFileName,
    int PageCount,
    bool RequiresOcr,
    string Status,
    List<ExtractedFieldEditDto> Fields);

public record UpdateFieldRequestDto(Guid FieldId, string? NewValue);

public record SendEmailRequestDto(Guid DocumentId, string ToAddress, string? Message);
