using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared between every AI field-extraction provider: the extraction prompt and
/// the "clean up the model's JSON reply" logic are identical regardless of which
/// model answers, so this is the one place both live to avoid drift between providers.
/// </summary>
internal static class AiExtractionPromptHelper
{
    public static string BuildPrompt(IEnumerable<PdfPageTextDto> pages)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");

        return $$"""
            Extract every meaningful key/value field from the document text below.
            Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
            [{"key": "Invoice Number", "value": "INV-2024-001", "page": 1}, ...]
            If a field has no page-specific meaning, omit "page" or set it to null.

            DOCUMENT TEXT:
            {{combinedText}}
            """;
    }

    public static List<ExtractedFieldDto> ParseFieldsJson(string rawModelText)
    {
        var cleaned = rawModelText.Trim().TrimStart('`').TrimEnd('`')
            .Replace("json", "", StringComparison.OrdinalIgnoreCase).Trim();

        var parsed = JsonSerializer.Deserialize<List<ExtractedFieldJson>>(cleaned, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                     ?? new List<ExtractedFieldJson>();

        return parsed.Select(f => new ExtractedFieldDto(f.Key, f.Value, f.Page)).ToList();
    }

    private class ExtractedFieldJson
    {
        public string Key { get; set; } = default!;
        public string? Value { get; set; }
        public int? Page { get; set; }
    }
}
