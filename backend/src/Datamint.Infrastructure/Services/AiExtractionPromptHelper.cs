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
    /// Formatted mode (requestedFields set): the AI extracts ONLY those exact fields,
    /// each expected to have one canonical value, so a flat array is unambiguous - use
    /// ParseFieldsJson on the reply.
    ///
    /// Dynamic mode (requestedFields null/empty): the AI decides which fields exist,
    /// and the SAME label can legitimately repeat across pages with different values
    /// (e.g. a multi-page invoice repeating "Tax Category" per page, each meaning
    /// something different). A flat array with duplicate "key" values is an unusual,
    /// ambiguous shape for a model to keep genuinely distinct - it tends to "helpfully"
    /// deduplicate what look like repeated keys, silently dropping one page's value.
    /// Grouping the requested output by page instead makes that conflation structurally
    /// impossible - use ParsePageGroupedFieldsJson on the reply.
    /// </summary>
    /// <summary>
    /// Shared by every prompt that asks the model to classify fields - kept generic/domain-agnostic
    /// on purpose so the same taxonomy organizes invoices, shipping/logistics manifests, contracts,
    /// medical forms, or any other document type equally well, not just invoices.
    /// </summary>
    private const string TypeAndSectionInstructions = """
        - Classify each field with a "type" from this fixed list: "Address", "Date", "Amount", "Name", "Reference", "Contact", "Quantity", "Generic". Use "Generic" whenever a field doesn't clearly fit one of the other types - never invent a new type name.
        - Assign each field a short "section" label that groups it with other fields on the same page that logically belong together (e.g. "Shipping Details", "Billing Info", "Line Items", "Party Information"). Reuse the exact same section label, character for character, across every field that belongs to that group. If a field doesn't obviously belong to a named group, use "General".
        """;

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
                {{TypeAndSectionInstructions}}
                - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info"}, ...]

                DOCUMENT TEXT:
                {{combinedText}}
                """;
        }

        return $$"""
            Extract every meaningful key/value field from the document text below. Process
            each page independently and be thorough: a field that is visibly labeled on a
            page must always be extracted from that page, every time, never skipped.

            Rules:
            - Use the field's own label from the document as the "key", exactly as written (e.g. if the document says "Invoice No.", use "Invoice No.", not "Invoice Number").
            - Do not paraphrase, translate, or invent a different name for a field that already has a label in the document.
            - The SAME field label can legitimately appear on more than one page, meaning something different each time (a multi-page document repeating a label like "Tax Category" or "Amount" per page, with a different value on each page). Report every page's occurrence under that page's own entry below - never merge, average, or drop one occurrence in favor of another just because the label repeats.
            - If a field spans the whole document rather than belonging to one page, put it under the first page it appears on.
            {{TypeAndSectionInstructions}}
            - Respond with ONLY a JSON array, no prose, no markdown fences, with exactly ONE object per page (matching the "--- Page N ---" markers below), in this exact shape:
            [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info"}, {"key": "Tax Category", "value": "...", "type": "Generic", "section": "General"}]}, {"page": 2, "fields": [{"key": "Tax Category", "value": "...", "type": "Generic", "section": "General"}]}]

            DOCUMENT TEXT:
            {{combinedText}}
            """;
    }

    /// <summary>
    /// Second pass: hands the model its own first-pass answer alongside the source
    /// text again and asks it to double-check every value character by character.
    /// This "extract, then verify" pattern catches the single-pass mistakes users
    /// see most often (a digit transposed in an invoice number, a value picked up
    /// from the wrong page) - it doesn't make the model infallible, but it removes
    /// a real class of errors a single pass leaves in.
    /// </summary>
    public static string BuildVerificationPrompt(IEnumerable<PdfPageTextDto> pages, List<ExtractedFieldDto> initialFields, bool groupByPage)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");

        if (groupByPage)
        {
            var grouped = initialFields
                .GroupBy(f => f.PageNumber ?? 0)
                .Select(g => new { page = g.Key, fields = g.Select(f => new { key = f.Key, value = f.Value, type = f.SemanticType, section = f.SectionLabel }).ToList() });
            var fieldsJson = JsonSerializer.Serialize(grouped);

            return $$"""
                You previously extracted the fields below, grouped by page, from the document
                text that follows. Re-check every single value against the document text,
                character by character where it matters (invoice/reference numbers, dates,
                amounts, IDs, codes) - these are exactly the kind of value a first pass
                sometimes gets slightly wrong (a transposed digit, a value taken from the
                wrong line, or a value that actually belongs to a different page).

                Rules:
                - If a value is already correct, keep it exactly as-is.
                - If a value is wrong, or belongs on a different page than where you put it, correct it using the document text.
                - If a value is missing (null) but the field is actually present on that page, fill it in.
                - If a field genuinely isn't on that page, leave its value null.
                - Keep the same pages and the same keys within each page - do not add, remove, or rename any. Same-named fields on different pages are intentional and must both be kept, with their own correct values.
                - "type" and "section" may be corrected if clearly wrong (unlike keys, which must stay stable) - otherwise keep them as given.
                {{TypeAndSectionInstructions}}

                YOUR FIRST-PASS EXTRACTION (grouped by page):
                {{fieldsJson}}

                DOCUMENT TEXT:
                {{combinedText}}

                Respond with ONLY the corrected JSON array, no prose, no markdown fences, same shape:
                [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info"}]}, ...]
                """;
        }

        var flatFieldsJson = JsonSerializer.Serialize(initialFields.Select(f => new { key = f.Key, value = f.Value, page = f.PageNumber, type = f.SemanticType, section = f.SectionLabel }));

        return $$"""
            You previously extracted the fields below from the document text that follows.
            Re-check every single value against the document text, character by character
            where it matters (invoice/reference numbers, dates, amounts, IDs, codes) -
            these are exactly the kind of value a first pass sometimes gets slightly
            wrong (a transposed digit, a value taken from the wrong line or page).

            Rules:
            - If a value is already correct, keep it exactly as-is.
            - If a value is wrong or was picked up from the wrong place, correct it using the document text.
            - If a value is missing (null) but the field is actually present in the text, fill it in.
            - If a field genuinely isn't in the document, leave its value null.
            - Keep the exact same set of keys, in the exact same order - do not add, remove, or rename any.
            - "type" and "section" may be corrected if clearly wrong (unlike keys, which must stay stable) - otherwise keep them as given.
            {{TypeAndSectionInstructions}}

            YOUR FIRST-PASS EXTRACTION:
            {{flatFieldsJson}}

            DOCUMENT TEXT:
            {{combinedText}}

            Respond with ONLY the corrected JSON array, no prose, no markdown fences, same shape:
            [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info"}, ...]
            """;
    }

    /// <summary>
    /// Reconciles field labels across an entire batch of independently-extracted documents.
    /// Deliberately conservative in tone ("only merge if confident") - a wrong merge that
    /// conflates two genuinely different fields into one column is worse than leaving two
    /// near-duplicate labels unmerged, so the prompt explicitly trades recall for precision.
    /// </summary>
    public static string BuildHarmonizationPrompt(IReadOnlyList<string> distinctKeys)
    {
        var keysJson = JsonSerializer.Serialize(distinctKeys);
        return $$"""
            You are an expert at analyzing structured business documents (invoices, receipts,
            forms, contracts). The field labels below were extracted independently from
            SEVERAL documents that were uploaded together as one batch. Some labels refer to
            the exact same real-world piece of information but are worded differently purely
            because each document phrases its own label differently - for example "Invoice
            Number", "Invoice No", "Inv #", and "Invoice #" would all refer to the same field.

            Your task: group together every label you are confident refers to the same
            real-world field, and choose ONE clear, professional, standard name for each group
            (Title Case, no abbreviations - e.g. "Invoice Number", not "Inv #" or
            "invoice_number"). Every label in a group must map to that same chosen name,
            including whichever label was itself picked as the canonical one.

            Be conservative: only merge labels you are genuinely confident mean the same
            thing. Two labels that merely sound similar but could plausibly refer to
            different real-world concepts (e.g. "Customer Name" vs "Vendor Name", "Subtotal"
            vs "Total Amount") must NOT be merged - keep each as its own canonical name
            instead. A wrong merge that conflates two different fields is worse than leaving
            two similar-looking labels unmerged.

            LABELS (JSON array, exactly as extracted - do not alter their spelling when using them as object keys below):
            {{keysJson}}

            Respond with ONLY a JSON object mapping every single label above (as the object
            key, character-for-character identical to the input) to its chosen canonical name
            (as the value) - one entry per input label, no extra prose, no markdown fences.
            Example shape:
            {"Invoice No": "Invoice Number", "Invoice Number": "Invoice Number", "Inv #": "Invoice Number", "Customer Name": "Customer Name"}
            """;
    }

    public static Dictionary<string, string> ParseHarmonizationMapping(string rawModelText)
    {
        var cleaned = CleanJsonText(rawModelText);
        return JsonSerializer.Deserialize<Dictionary<string, string>>(cleaned, JsonOptions) ?? new Dictionary<string, string>();
    }

    /// <summary>Flat-array response parser - used for Formatted mode, where every requested field has one canonical value.</summary>
    public static List<ExtractedFieldDto> ParseFieldsJson(string rawModelText)
    {
        var cleaned = CleanJsonText(rawModelText);
        var parsed = JsonSerializer.Deserialize<List<FlatFieldJson>>(cleaned, JsonOptions)
                     ?? new List<FlatFieldJson>();

        return parsed.Select(f => new ExtractedFieldDto(f.Key, f.Value, f.Page, f.Type, f.Section)).ToList();
    }

    /// <summary>Page-grouped response parser - used for Dynamic mode, flattened back into the same ExtractedFieldDto shape the rest of the app uses.</summary>
    public static List<ExtractedFieldDto> ParsePageGroupedFieldsJson(string rawModelText)
    {
        var cleaned = CleanJsonText(rawModelText);
        var parsed = JsonSerializer.Deserialize<List<PageGroupJson>>(cleaned, JsonOptions)
                     ?? new List<PageGroupJson>();

        var result = new List<ExtractedFieldDto>();
        foreach (var group in parsed)
        {
            if (group.Fields is null) continue;
            foreach (var field in group.Fields)
                result.Add(new ExtractedFieldDto(field.Key, field.Value, group.Page, field.Type, field.Section));
        }
        return result;
    }

    private static string CleanJsonText(string rawModelText) =>
        rawModelText.Trim().TrimStart('`').TrimEnd('`')
            .Replace("json", "", StringComparison.OrdinalIgnoreCase).Trim();

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private class FlatFieldJson
    {
        public string Key { get; set; } = default!;
        public string? Value { get; set; }
        public int? Page { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
    }

    private class PageGroupJson
    {
        public int? Page { get; set; }
        public List<FieldOnlyJson>? Fields { get; set; }
    }

    private class FieldOnlyJson
    {
        public string Key { get; set; } = default!;
        public string? Value { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
    }
}
