using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
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

    /// <summary>
    /// Filters out two common sources of "junk" extraction on real-world documents: a blank
    /// fill-in line whose only printed content is placeholder characters (never an actual
    /// answer), and a large block of fixed legal boilerplate (which is real printed text, but
    /// not a "data point" anyone extracting this document is after). Also explains how to read
    /// the annotation/form-field hint blocks the extraction pipeline appends after each page's
    /// text - those exist specifically to recover answers a person filled in via a PDF
    /// annotation or form field, which otherwise never appear in the page's printed text at all.
    /// </summary>
    private const string SignalVsNoiseInstructions = """
        - A run of underscores, dashes, dots, or blank space after a label (e.g. "Date: ___________") is a blank fill-in line, not a value - it means nothing was printed there. Never report the underscores/dashes/dots themselves as the "value". If nothing else on the page supplies a real answer for that label (see the next two rules), treat the field as having no value: use null in Formatted mode, or simply don't emit that field at all in Dynamic mode (an unanswered blank line isn't a meaningful data point to report).
        - Some PDFs have a person's actual answer stored separately from the printed template - as a fillable form field, or as a small text overlay/annotation positioned on top of a blank line - rather than printed inline with the label. When the document text below includes a section headed "[Values entered into this PDF's fillable form fields...]" or "[Filled-in values found on this page as separate annotations/overlays...]", those are the real answers: match each one (by field name, or by the "near <label>" hint) to the blank/underscored field it belongs to, and use it as that field's value instead of leaving it blank or copying the underscores.
        - Do not extract a large block of standard printed legal/administrative boilerplate (terms and conditions, warranty disclaimers, liability clauses, standard signature-block captions, page footers) as a field value - this is fixed print repeated on every such document, not a data point specific to this one. It's fine to note that a "Terms and Conditions" section exists (e.g. as a short section heading with no value, or omitted entirely) but never dump paragraphs of that boilerplate text into a field's value.
        - Blank templates (invoice/form templates a person hasn't filled in yet) often print generic placeholder text as an example of what belongs in a field, instead of leaving it truly blank - e.g. a "Bill To" block might literally print "Client Company Name" instead of a real client's name, or "Enter Date Here" instead of an actual date. This is exactly like an unfilled blank/underscored line: the placeholder describes the category of information expected there, in generic terms, rather than naming a specific real instance of it - it is not a real answer, don't report it as the field's value (null in Formatted mode, omit in Dynamic mode). A good signal for this: nearby fields in the same block are also genuinely empty (blank lines, or bare labels with nothing printed after them at all) - if a whole block looks unfilled, treat every field in it as unfilled, even the ones whose placeholder text happens to look plausible.
        """;

    /// <summary>
    /// Every requested field must be matched to whatever the document itself calls it, not to
    /// the caller's literal wording - a document rarely uses the exact same words a caller asks
    /// for (abbreviations, synonyms, different word order/language). Used only in Formatted mode,
    /// where the caller supplies a fixed field list.
    /// </summary>
    private const string FuzzyFieldMatchInstructions = """
        - The document's own label for a requested field is often worded differently than the request itself - an abbreviation, a synonym, a different word order, or a different language (e.g. a request for "Invoice Number" should match a printed "Inv #", "INV No.", "Invoice No", "Bill Number", or "Reference No." when it clearly identifies the same real-world document). Match by MEANING, not exact text - search the whole document for whatever data actually answers the request, regardless of how differently it's labeled there. This only changes how you search the document; the "key" in your response must still be the caller's exact requested string (see the rule above), never the document's own wording.
        """;

    /// <summary>
    /// Dynamic mode only - Formatted mode's flat verification prompt keeps its own absolute
    /// "do not remove any" rule (a caller who explicitly requested two field names may want both
    /// kept even if they resolve to the same value in some documents; the AI has no business
    /// collapsing caller-specified keys). Deliberately conservative in the same spirit as
    /// BuildHarmonizationPrompt - a wrong merge is worse than a duplicate left in place.
    /// </summary>
    private const string DeduplicationInstructions = """
        - Within the SAME page's fields only, if two or more fields clearly capture the exact same real-world data point twice under different keys (the same identity/meaning, from their labels and context, AND the same value), keep the clearer/more standard-sounding one and remove the redundant duplicate entirely. Never merge solely because two fields' values happen to coincide (e.g. two different, unrelated line items that both happen to cost $100) - they must also represent the same real-world thing. Be conservative: if you are not confident two fields are true duplicates, keep both. This never applies across different pages - the same label legitimately repeating on a DIFFERENT page with a different (or even the same) value is intentional and must always be kept, never removed for this reason.
        """;

    public static string BuildPrompt(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, bool isRetryAfterEmptyResult = false)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");

        var retryNote = isRetryAfterEmptyResult
            ? "NOTE: a previous attempt at this exact extraction returned no usable fields. Re-examine the document text and any page images carefully before answering again - if this is a real document with visible content, there should be extractable data.\n\n"
            : "";

        if (requestedFields is { Count: > 0 })
        {
            var fieldList = string.Join("\n", requestedFields.Select(f => $"- \"{f}\""));
            return $$"""
                {{retryNote}}Extract ONLY the following fields from the document text below - nothing else:
                {{fieldList}}

                Rules:
                - Use these exact field names as the "key" in your response, character for character - do not rename, translate, or reword them.
                - If a requested field is not present anywhere in the document, still include it in your response with "value": null. Do not omit it.
                - Do not add any field that isn't in the list above - this holds even if you can also see an image of this document: an image is provided only to help you read/locate the requested fields more accurately (e.g. telling which value in a table belongs to which column, or reading a faint/handwritten value), never a reason to also report other information you happen to see in it, no matter how prominent that information looks. Your response must contain exactly the fields requested above - not more, not fewer.
                - If a field appears on a specific page, set "page" to that page number; otherwise omit "page" or set it to null.
                {{FuzzyFieldMatchInstructions}}
                {{TypeAndSectionInstructions}}
                {{SignalVsNoiseInstructions}}
                - Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info", "priority": 1}, ...]

                DOCUMENT TEXT:
                {{combinedText}}
                """;
        }

        return $$"""
            {{retryNote}}Extract every meaningful key/value field from the document text below - this may be
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
            {{SignalVsNoiseInstructions}}
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
                - Keep the same pages and the same keys within each page - do not rename any existing entry, and do not remove one EXCEPT for a confirmed same-page duplicate per the rule below. Same-named fields on different pages are intentional and must both be kept, with their own correct values.
                - "type", "section", and "priority" may be corrected if clearly wrong (unlike keys, which must stay stable) - otherwise keep them as given.
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
