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
    /// financial statements, medical forms, or any other document type equally well. The examples
    /// below (balance sheets, GST/TDS/ITR forms, etc.) are illustrative hints only, never a fixed
    /// schema to force onto every document - the model must keep deciding sections/types/priority
    /// fresh from whatever is actually in front of it.
    /// </summary>
    private const string TypeAndSectionInstructions = """
        - Classify each field with a "type" from this fixed list: "Address", "Date", "Amount", "Name", "Reference", "Contact", "Quantity", "Generic". Use "Generic" whenever a field doesn't clearly fit one of the other types - never invent a new type name.
        - Assign each field a short "section" label that groups it with other fields that logically belong together (e.g. "Shipping Details", "Billing Info", "Line Items", "Party Information", or - for financial/accounting documents such as balance sheets, profit & loss statements, cash flow statements, trial balances, ledgers, GST returns, TDS certificates, ITR forms, or audit reports - section names like "Assets", "Liabilities", "Equity", "Revenue", "Expenses", "Tax Summary", "Auditor Details"). These are examples only, not a fixed list - name each section after what the document itself actually contains. Reuse the exact same section label, character for character, across every field that belongs to that group, even across pages. If a field doesn't obviously belong to a named group, use "General".
        - Assign each field a "priority" integer (1 = most important). Judge importance yourself, fresh for this document: what would a reader look for first - key totals, final balances, primary reference/identifying numbers, the main parties involved - gets low numbers; supporting detail, boilerplate, and incidental line items get higher numbers. Fields in the same section should usually share the same or a close priority value. Never derive priority from a fixed rule or field name alone - decide it from what this specific document is actually about.
        """;

    /// <summary>
    /// Reinforces exhaustiveness on dense, tabular documents (financial statements, ledgers,
    /// schedules) where a model is most likely to summarize or truncate instead of listing every
    /// row - the single biggest cause of "missing data" complaints on this kind of document.
    /// </summary>
    private const string CompletenessInstructions = """
        - Never skip, summarize, truncate, or silently drop any labeled data point, no matter how many there are on a page - completeness matters more than brevity.
        - If a page contains a table (e.g. a schedule of line items, a ledger, a list of assets/liabilities, transaction rows), extract EVERY row as its own field, not just a subtotal or the first few rows. Build each row's key from its row label/description (e.g. "Salary Expense", "Accounts Payable - Vendor X"); if the same row label repeats within one table, distinguish each occurrence (e.g. append a distinguishing detail, a date, or a running index) so no two distinct rows collapse into one key.
        - Numeric values (amounts, quantities, percentages) must be copied exactly as printed, including currency symbols, thousands separators, decimals, and parentheses/minus signs used for negative amounts - do not normalize, round, or reformat them.
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
                {{CompletenessInstructions}}
                - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info", "priority": 1}, ...]

                DOCUMENT TEXT:
                {{combinedText}}
                """;
        }

        return $$"""
            Extract every meaningful key/value field from the document text below - this may be
            an invoice, a logistics/shipping manifest, a contract, a financial statement or
            accounting document (balance sheet, profit & loss, cash flow, trial balance, ledger,
            GST/TDS/ITR filing, audit report), or any other kind of document; adapt to whatever
            is actually in front of you rather than assuming any one document type. Process each
            page independently and be exhaustive: a field or table row that is visibly present on
            a page must always be extracted from that page, every time, never skipped, summarized,
            or truncated for brevity - this document may be dense with many rows of tabular data,
            and every one of them matters.

            Rules:
            - Use the field's own label from the document as the "key", exactly as written (e.g. if the document says "Invoice No.", use "Invoice No.", not "Invoice Number").
            - Do not paraphrase, translate, or invent a different name for a field that already has a label in the document.
            - The SAME field label can legitimately appear on more than one page, meaning something different each time (a multi-page document repeating a label like "Tax Category" or "Amount" per page, with a different value on each page). Report every page's occurrence under that page's own entry below - never merge, average, or drop one occurrence in favor of another just because the label repeats.
            - If a field spans the whole document rather than belonging to one page, put it under the first page it appears on.
            {{TypeAndSectionInstructions}}
            {{CompletenessInstructions}}
            - Respond with ONLY a JSON array, no prose, no markdown fences, with exactly ONE object per page (matching the "--- Page N ---" markers below), in this exact shape:
            [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info", "priority": 1}, {"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}, {"page": 2, "fields": [{"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}]

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
                .Select(g => new { page = g.Key, fields = g.Select(f => new { key = f.Key, value = f.Value, type = f.SemanticType, section = f.SectionLabel, priority = f.Priority }).ToList() });
            var fieldsJson = JsonSerializer.Serialize(grouped);

            return $$"""
                You previously extracted the fields below, grouped by page, from the document
                text that follows. Re-check every single value against the document text,
                character by character where it matters (invoice/reference numbers, dates,
                amounts, IDs, codes) - these are exactly the kind of value a first pass
                sometimes gets slightly wrong (a transposed digit, a value taken from the
                wrong line, or a value that actually belongs to a different page). Also check
                for anything genuinely missing altogether: if this document has dense tabular
                data (a schedule, ledger, or list of line items) and the first pass only
                captured some rows, add every missing row now.

                Rules:
                - If a value is already correct, keep it exactly as-is.
                - If a value is wrong, or belongs on a different page than where you put it, correct it using the document text.
                - If a value is missing (null) but the field is actually present on that page, fill it in.
                - If a field genuinely isn't on that page, leave its value null.
                - If an entire row/field present in the document text was missed by the first pass, add it now, on the correct page.
                - Keep the same pages and the same keys within each page - do not remove or rename any existing entry. Same-named fields on different pages are intentional and must both be kept, with their own correct values.
                - "type", "section", and "priority" may be corrected if clearly wrong (unlike keys, which must stay stable) - otherwise keep them as given.
                {{TypeAndSectionInstructions}}
                {{CompletenessInstructions}}

                YOUR FIRST-PASS EXTRACTION (grouped by page):
                {{fieldsJson}}

                DOCUMENT TEXT:
                {{combinedText}}

                Respond with ONLY the corrected JSON array, no prose, no markdown fences, same shape:
                [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info", "priority": 1}]}, ...]
                """;
        }

        var flatFieldsJson = JsonSerializer.Serialize(initialFields.Select(f => new { key = f.Key, value = f.Value, page = f.PageNumber, type = f.SemanticType, section = f.SectionLabel, priority = f.Priority }));

        return $$"""
            You previously extracted the fields below from the document text that follows -
            this is a fixed, caller-specified list of fields, not an open-ended extraction.
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
            - "type", "section", and "priority" may be corrected if clearly wrong (unlike keys, which must stay stable) - otherwise keep them as given.
            {{TypeAndSectionInstructions}}

            YOUR FIRST-PASS EXTRACTION:
            {{flatFieldsJson}}

            DOCUMENT TEXT:
            {{combinedText}}

            Respond with ONLY the corrected JSON array, no prose, no markdown fences, same shape:
            [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info", "priority": 1}, ...]
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

        return parsed.Select(f => new ExtractedFieldDto(f.Key, f.Value, f.Page, f.Type, f.Section, f.Priority)).ToList();
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
                result.Add(new ExtractedFieldDto(field.Key, field.Value, group.Page, field.Type, field.Section, field.Priority));
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
        public int? Priority { get; set; }
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
        public int? Priority { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
    }
}
