namespace Datamint.Application.DTOs;

// Deliberately its own shape rather than reusing DocumentDetailDto/ExtractedFieldEditDto
// (which are flat lists) - JSON export should mirror the section/group structure, closer
// to how a real document-intelligence API (e.g. docupipe.ai) organizes extracted data.

public record JsonExportFieldDto(string FieldKey, string? Value, string SemanticType, string? OriginalFieldKey, bool WasEditedByUser, int? PageNumber);

public record JsonExportSectionDto(string Name, List<JsonExportFieldDto> Fields);

public record JsonExportDocumentDto(Guid DocumentId, string FileName, List<JsonExportSectionDto> Sections);

public record JsonExportBatchDto(List<JsonExportDocumentDto> Documents);
