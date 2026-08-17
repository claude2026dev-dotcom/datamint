namespace Datamint.Application.DTOs;

/// <summary>
/// Result of a single, un-chunked Claude extraction call made purely to observe token usage -
/// deliberately independent of AiExtractionResultDto/ExtractedFieldDto, since this always returns
/// the model's raw JSON text verbatim rather than parsing it into structured fields.
/// </summary>
public record TokenTestExtractionResultDto(bool Success, string? ResultJson, int InputTokens, int OutputTokens, string Model, string? ErrorMessage);
