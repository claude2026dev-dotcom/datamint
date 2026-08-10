using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Datamint.Application.DTOs;
using Datamint.Domain.Entities;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared between every AI field-extraction provider: the extraction prompt and the "clean up
/// the model's JSON reply" logic are identical regardless of which model answers, so this is
/// the one place both live to avoid drift between providers. Every prompt-building method takes
/// the caller's resolved ExtractionTier so an admin-configured CustomInstructions/
/// CustomOutputFormatExample can be layered on top of the built-in rules, invisibly to the end
/// user, without touching the base rules themselves.
/// </summary>
internal static class AiExtractionPromptHelper
{
    /// <summary>
    /// Shared by every prompt that asks the model to classify fields - kept generic/domain-agnostic
    /// on purpose so the same taxonomy organizes invoices, shipping/logistics manifests, contracts,
    /// financial statements, medical forms, or any other document type equally well.
    /// </summary>
    private const string TypeAndSectionInstructions = """
        - Classify each field with a "type" from this fixed list, matching real spreadsheet cell data types so the exported file can store/format each value correctly: "Text", "Number", "Currency", "Date", "Percentage", "Boolean". Use "Text" for anything that isn't genuinely one of the others - names, addresses, phone numbers, emails, URLs, and identifying codes/reference numbers (invoice numbers, GSTIN, CIN, UDIN, PAN, account numbers) are all "Text", since coercing them to a number would corrupt leading zeros or non-numeric characters. "Currency" is money/an amount with a currency meaning. "Number" is a plain count/measurement with no currency meaning. "Percentage" is a value expressed with a % sign or the word "percent". "Boolean" is strictly a yes/no or true/false answer. Never invent a new type name.
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

    /// <summary>
    /// Filters out two common sources of "junk" extraction on real-world documents: a blank
    /// fill-in line whose only printed content is placeholder characters, and a large block of
    /// fixed legal boilerplate. Also explains how to read the annotation/form-field hint blocks
    /// appended after each page's text.
    /// </summary>
    private const string SignalVsNoiseInstructions = """
        - Only report a value that is actually printed, typed, or filled in somewhere on the document - never guess, infer, calculate, autocomplete, or fabricate a value that isn't genuinely present, even if it seems like an obvious or expected answer. When genuinely unsure whether something counts as a real value, leave it out rather than invent one.
        - A run of underscores, dashes, dots, or blank space after a label (e.g. "Date: ___________") is a blank fill-in line, not a value - it means nothing was printed there. Never report the underscores/dashes/dots themselves as the "value". If nothing else on the page supplies a real answer for that label (see the next two rules), treat the field as having no value: use null in Formatted mode, or simply don't emit that field at all in Dynamic mode.
        - Some PDFs have a person's actual answer stored separately from the printed template - as a fillable form field, or as a small text overlay/annotation positioned on top of a blank line - rather than printed inline with the label. When the document text below includes a section headed "[Values entered into this PDF's fillable form fields...]" or "[Filled-in values found on this page as separate annotations/overlays...]", those are the real answers: match each one (by field name, or by the "near <label>" hint) to the blank/underscored field it belongs to, and use it as that field's value instead of leaving it blank or copying the underscores.
        - Do not extract a large block of standard printed legal/administrative boilerplate (terms and conditions, warranty disclaimers, liability clauses, standard signature-block captions, page footers) as a field value - this is fixed print repeated on every such document, not a data point specific to this one. It's fine to note that a "Terms and Conditions" section exists (e.g. as a short section heading with no value, or omitted entirely) but never dump paragraphs of that boilerplate text into a field's value.
        - Blank templates (invoice/form templates a person hasn't filled in yet) often print generic placeholder text as an example of what belongs in a field, instead of leaving it truly blank - e.g. a "Bill To" block might literally print "Client Company Name" instead of a real client's name. This is exactly like an unfilled blank/underscored line: not a real answer, don't report it as the field's value. A good signal for this: nearby fields in the same block are also genuinely empty - if a whole block looks unfilled, treat every field in it as unfilled.
        """;

    /// <summary>
    /// Every requested field must be matched to whatever the document itself calls it, not to
    /// the caller's literal wording. Used only in Formatted mode.
    /// </summary>
    private const string FuzzyFieldMatchInstructions = """
        - The document's own label for a requested field is often worded differently than the request itself - an abbreviation, a synonym, a different word order, or a different language (e.g. a request for "Invoice Number" should match a printed "Inv #", "INV No.", "Invoice No", "Bill Number", or "Reference No." when it clearly identifies the same real-world document). Match by MEANING, not exact text. This only changes how you search the document; the "key" in your response must still be the caller's exact requested string, never the document's own wording.
        """;

    /// <summary>
    /// Dynamic mode only - deliberately conservative: a wrong merge is worse than a duplicate
    /// left in place.
    /// </summary>
    private const string DeduplicationInstructions = """
        - Within the SAME page's fields only, if two or more fields clearly capture the exact same real-world data point twice under different keys (the same identity/meaning, from their labels and context, AND the same value), keep the clearer/more standard-sounding one and remove the redundant duplicate entirely. Never merge solely because two fields' values happen to coincide. Be conservative: if you are not confident two fields are true duplicates, keep both. This never applies across different pages.
        """;

    /// <summary>Layers an admin-configured tier's optional prompt customization on top of the
    /// built-in rules - empty/null on both fields means the built-in prompt is used unmodified.</summary>
    private static string BuildTierCustomizationBlock(ExtractionTier tier)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(tier.CustomInstructions))
            parts.Add($"Additional extraction guidance for this document:\n{tier.CustomInstructions}");
        if (!string.IsNullOrWhiteSpace(tier.CustomOutputFormatExample))
            parts.Add($"In addition to the field-list rules above, try to structurally match this example output shape where applicable:\n{tier.CustomOutputFormatExample}");
        return parts.Count == 0 ? "" : "\n" + string.Join("\n\n", parts) + "\n";
    }

    public static string BuildPrompt(IEnumerable<PdfPageTextDto> pages, ExtractionTier tier, IReadOnlyList<string>? requestedFields = null, bool isRetryAfterEmptyResult = false)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");

        var retryNote = isRetryAfterEmptyResult
            ? "NOTE: a previous attempt at this exact extraction returned no usable fields. Re-examine the document text and any page images carefully before answering again - if this is a real document with visible content, there should be extractable data.\n\n"
            : "";
        var customization = BuildTierCustomizationBlock(tier);

        if (requestedFields is { Count: > 0 })
        {
            var fieldList = string.Join("\n", requestedFields.Select(f => $"- \"{f}\""));
            return $$"""
                {{retryNote}}Extract ONLY the following fields from the document text below - nothing else:
                {{fieldList}}

                Rules:
                - Use these exact field names as the "key" in your response, character for character - do not rename, translate, or reword them.
                - If a requested field is not present anywhere in the document, still include it in your response with "value": null. Do not omit it.
                - Do not add any field that isn't in the list above - this holds even if you can also see an image of this document: an image is provided only to help you read/locate the requested fields more accurately, never a reason to also report other information you happen to see in it.
                - If a field appears on a specific page, set "page" to that page number; otherwise omit "page" or set it to null.
                {{FuzzyFieldMatchInstructions}}
                {{TypeAndSectionInstructions}}
                {{SignalVsNoiseInstructions}}
                {{customization}}
                - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info", "priority": 1}, ...]

                DOCUMENT TEXT:
                {{combinedText}}
                """;
        }

        return $$"""
            {{retryNote}}Extract every meaningful key/value field from the document text below - this may be
            an invoice, a logistics/shipping manifest, a contract, a financial statement or
            accounting document, or any other kind of document; adapt to whatever is actually in
            front of you rather than assuming any one document type. Process each page
            independently and be exhaustive: a field or table row that is visibly present on a
            page must always be extracted from that page, every time, never skipped, summarized,
            or truncated for brevity.

            Rules:
            - Use the field's own label from the document as the "key", exactly as written.
            - Do not paraphrase, translate, or invent a different name for a field that already has a label in the document.
            - The SAME field label can legitimately appear on more than one page, meaning something different each time. Report every page's occurrence under that page's own entry below - never merge, average, or drop one occurrence in favor of another just because the label repeats.
            - If a field spans the whole document rather than belonging to one page, put it under the first page it appears on.
            {{TypeAndSectionInstructions}}
            {{CompletenessInstructions}}
            {{SignalVsNoiseInstructions}}
            {{customization}}
            - Respond with ONLY a JSON array, no prose, no markdown fences, with exactly ONE object per page (matching the "--- Page N ---" markers below), in this exact shape:
            [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info", "priority": 1}, {"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}, {"page": 2, "fields": [{"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}]

            DOCUMENT TEXT:
            {{combinedText}}
            """;
    }

    /// <summary>
    /// Second pass: hands the model its own first-pass answer alongside the source text again
    /// and asks it to double-check every value character by character. This "extract, then
    /// verify" pattern catches the single-pass mistakes users see most often.
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
                amounts, IDs, codes). Also check for anything genuinely missing altogether: if
                this document has dense tabular data and the first pass only captured some rows,
                add every missing row now.

                Rules:
                - If a value is already correct, keep it exactly as-is.
                - If a value is wrong, or belongs on a different page than where you put it, correct it using the document text.
                - If a value is missing (null) but the field is actually present on that page, fill it in.
                - If a field genuinely isn't on that page, leave its value null.
                - If an entire row/field present in the document text was missed by the first pass, add it now, on the correct page.
                - Keep the same pages and the same keys within each page - do not rename any existing entry, and do not remove one EXCEPT for a confirmed same-page duplicate per the rule below.
                - "type", "section", and "priority" may be corrected if clearly wrong - otherwise keep them as given.
                {{TypeAndSectionInstructions}}
                {{CompletenessInstructions}}
                {{SignalVsNoiseInstructions}}
                {{DeduplicationInstructions}}

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
            You previously extracted the fields below from the document text that follows - this
            is a fixed, caller-specified list of fields, not an open-ended extraction. Re-check
            every single value against the document text, character by character where it matters.

            Rules:
            - If a value is already correct, keep it exactly as-is.
            - If a value is wrong or was picked up from the wrong place, correct it using the document text.
            - If a value is missing (null) but the field is actually present in the text, fill it in.
            - If a field genuinely isn't in the document, leave its value null.
            - Keep the exact same set of keys, in the exact same order - do not add, remove, or rename any.
            - "type", "section", and "priority" may be corrected if clearly wrong - otherwise keep them as given.
            {{FuzzyFieldMatchInstructions}}
            {{TypeAndSectionInstructions}}
            {{SignalVsNoiseInstructions}}

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
    /// Deliberately conservative - a wrong merge that conflates two genuinely different fields
    /// into one column is worse than leaving two near-duplicate labels unmerged.
    /// </summary>
    public static string BuildHarmonizationPrompt(IReadOnlyList<string> distinctKeys)
    {
        var keysJson = JsonSerializer.Serialize(distinctKeys);
        return $$"""
            You are an expert at analyzing structured business documents (invoices, receipts,
            forms, contracts). The field labels below were extracted independently from
            SEVERAL documents that were uploaded together as one batch. Some labels refer to
            the exact same real-world piece of information but are worded differently purely
            because each document phrases its own label differently.

            Your task: group together every label you are confident refers to the same
            real-world field, and choose ONE clear, professional, standard name for each group
            (Title Case, no abbreviations). Every label in a group must map to that same chosen
            name, including whichever label was itself picked as the canonical one.

            Be conservative: only merge labels you are genuinely confident mean the same thing.
            A wrong merge that conflates two different fields is worse than leaving two
            similar-looking labels unmerged.

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
        var parsed = DeserializeWithTruncationRepair<List<FlatFieldJson>>(cleaned)
                     ?? new List<FlatFieldJson>();

        return parsed.Select(f => new ExtractedFieldDto(f.Key, f.Value, f.Page, f.Type, f.Section, f.Priority)).ToList();
    }

    /// <summary>Page-grouped response parser - used for Dynamic mode, flattened back into the same ExtractedFieldDto shape the rest of the app uses.</summary>
    public static List<ExtractedFieldDto> ParsePageGroupedFieldsJson(string rawModelText)
    {
        var cleaned = CleanJsonText(rawModelText);
        var parsed = DeserializeWithTruncationRepair<List<PageGroupJson>>(cleaned)
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

    /// <summary>
    /// A large batch (many pages/documents in one call) can make the model's JSON response long
    /// enough to hit the provider's output-token cap mid-generation, leaving an unterminated
    /// string/object at the end. A plain Deserialize throws on that. Rather than losing every
    /// field in the batch to one truncated tail, this retries against the longest prefix of the
    /// response that ends on a complete top-level array element - recovering every page/field
    /// that DID finish generating and dropping only the one partial element at the very end.
    /// </summary>
    private static T? DeserializeWithTruncationRepair<T>(string json) where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            var repaired = RepairTruncatedJsonArray(json);
            if (ReferenceEquals(repaired, json)) throw; // no complete element found to salvage
            return JsonSerializer.Deserialize<T>(repaired, JsonOptions);
        }
    }

    /// <summary>
    /// Scans a (possibly truncated) top-level JSON array, tracking bracket depth while respecting
    /// quoted strings/escapes, and remembers the position right after the last time depth returned
    /// to 1 - i.e. the end of the last fully-formed element directly inside the outer array. Cuts
    /// there and closes the array. Returns the input unchanged (same reference) if no such point
    /// exists, so callers can detect "nothing salvageable" via reference equality.
    /// </summary>
    private static string RepairTruncatedJsonArray(string json)
    {
        var depth = 0;
        var inString = false;
        var escaped = false;
        var lastSafeCut = -1;

        foreach (var (c, i) in json.Select((c, i) => (c, i)))
        {
            if (inString)
            {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
                continue;
            }

            switch (c)
            {
                case '"': inString = true; break;
                case '[' or '{': depth++; break;
                case ']' or '}':
                    depth--;
                    if (depth == 1) lastSafeCut = i + 1;
                    break;
            }
        }

        return lastSafeCut <= 0 ? json : json[..lastSafeCut] + "]";
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private class FlatFieldJson
    {
        public string Key { get; set; } = default!;
        [JsonConverter(typeof(FlexibleStringConverter))]
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
        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? Value { get; set; }
        public int? Priority { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
    }

    /// <summary>
    /// Some models (observed with Claude Haiku 4.5) don't reliably keep "value" a plain
    /// string despite the prompt asking for one - e.g. returning a JSON array when a field
    /// looks like it has several matches, or a bare number for a numeric-looking value. The
    /// model's raw reply is an external-API boundary, not something we control the shape of,
    /// so the parser coerces any of these back into the flat string the rest of the app
    /// expects instead of throwing and failing the whole document.
    /// </summary>
    private sealed class FlexibleStringConverter : JsonConverter<string?>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            ReadValue(ref reader);

        private static string? ReadValue(ref Utf8JsonReader reader)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.String:
                    return reader.GetString();
                case JsonTokenType.Number:
                    using (var numDoc = JsonDocument.ParseValue(ref reader))
                        return numDoc.RootElement.GetRawText();
                case JsonTokenType.True:
                case JsonTokenType.False:
                    return reader.GetBoolean().ToString();
                case JsonTokenType.StartArray:
                    var items = new List<string>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                    {
                        var item = ReadValue(ref reader);
                        if (!string.IsNullOrWhiteSpace(item))
                            items.Add(item);
                    }
                    return items.Count > 0 ? string.Join("; ", items) : null;
                case JsonTokenType.StartObject:
                    using (var objDoc = JsonDocument.ParseValue(ref reader))
                        return objDoc.RootElement.GetRawText();
                default:
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value);
    }
}
