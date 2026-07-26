namespace Datamint.Application.DTOs;

public record ExtractionTierDto(
    Guid Id, string Name, string AiProvider, string ModelName,
    string? CustomOutputFormatExample, string? CustomInstructions,
    bool IsDefault, bool IsEnabled, int PlanCount, DateTime CreatedAtUtc);

public record CreateExtractionTierRequestDto(string Name, string AiProvider, string ModelName, string? CustomOutputFormatExample, string? CustomInstructions);

public record UpdateExtractionTierRequestDto(string Name, string AiProvider, string ModelName, string? CustomOutputFormatExample, string? CustomInstructions);

public record ExtractionTierFilterDto(string? Search = null, bool? IsEnabled = null, int Page = 1, int PageSize = 25);
