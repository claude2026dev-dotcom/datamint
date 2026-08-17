using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>
/// A single raw Claude Messages API call - no two-pass extract/verify, no chunking, no
/// ExtractedField persistence - that returns the model's JSON output verbatim alongside the
/// input/output token counts Claude reports for that exact call. Exists only to back the
/// token-usage sample app's "how many tokens did that cost" view; the real product pipeline
/// (IAiFieldExtractionService) never surfaces token counts because nothing in the product needs
/// them.
/// </summary>
public interface ITokenUsageExtractionService
{
    Task<TokenTestExtractionResultDto> ExtractWithUsageAsync(IReadOnlyList<PdfPageTextDto> pages, CancellationToken ct = default);
}
