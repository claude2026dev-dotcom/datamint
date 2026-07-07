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
    /// <summary>
    /// Dynamic mode (requestedFields null/empty): the AI decides which fields exist.
    /// Formatted mode (requestedFields set): the AI extracts ONLY those exact fields,
    /// in that exact order, with null values for anything not found in the document.
    /// </summary>
    public static string BuildPrompt(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");

        if (requestedFields is { Count: > 0 })
        {
            var fieldList = string.Join("\n", requestedFields.Select(f => $"- \"{f}\""));
            return $$"""
                Extract ONLY the following fields from the document text below - nothing else:
                {{fieldList}}

                Rules:
                - Use these exact field names as the "key" in your response, character for character - do not rename, translate, or reword them.
                - If a requested field is not present anywhere in the document, still include it in your response with "value": null. Do not omit it.
                - Do not add any field that isn't in the list above.
                - If a field appears on a specific page, set "page" to that page number; otherwise omit "page" or set it to null.
                - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1}, ...]

                DOCUMENT TEXT:
                {{combinedText}}
                """;
        }

        return $$"""
            Extract every meaningful key/value field from the document text below - be thorough
            and consistent: a field that is visibly labeled in the document must always be
            extracted, every time, never skipped or merged with another field.

            Rules:
            - Use the field's own label from the document as the "key", exactly as written (e.g. if the document says "Invoice No.", use "Invoice No.", not "Invoice Number").
            - Do not paraphrase, translate, or invent a different name for a field that already has a label in the document.
            - Extract every labeled field on every page, including ones that repeat with different values across pages.
            - If a field has no page-specific meaning, omit "page" or set it to null.
            - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
            [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1}, ...]

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
