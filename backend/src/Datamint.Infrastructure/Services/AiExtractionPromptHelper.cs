using System.Text;
using System.Text.Json;
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
public static class AiExtractionPromptHelper
{
    /// <summary>
    /// A prompt split into three pieces along cache-friendliness lines, not just readability:
    /// <see cref="SystemRules"/> is byte-identical across every call of the same (mode, pass,
    /// tier) - it belongs in the provider's cacheable "system" slot. <see cref="DocumentText"/>
    /// is byte-identical between a chunk's first-pass and verify call (same pages, same order) -
    /// it belongs in its own cacheable message block, placed before anything that varies.
    /// <see cref="TaskInstructions"/> is the part that's genuinely different every call (the
    /// retry note, the requested-field list, the prior extraction being verified) and is never
    /// cached. A provider that doesn't support explicit caching (see OpenAiFieldExtractionService)
    /// can simply concatenate all three back into one string - the split changes nothing about
    /// what the model reads, only how a caching-aware provider is billed for re-sending it.
    /// </summary>
    public record PromptParts(string SystemRules, string DocumentText, string TaskInstructions);

    /// <summary>
    /// Shared by every prompt that asks the model to classify fields - kept generic/domain-agnostic
    /// on purpose so the same taxonomy organizes invoices, shipping/logistics manifests, contracts,
    /// financial statements, medical forms, or any other document type equally well.
    /// </summary>
    private const string TypeAndSectionInstructions = """
        - "type": Text, Number, Currency, Date, Percentage, or Boolean (spreadsheet cell types) - never invent another. Default to Text for names, addresses, phone/email/URLs, and ID codes (invoice #, GSTIN, CIN, UDIN, PAN, account #) - coercing these to Number corrupts leading zeros/non-digits. Currency = a money amount; Number = a plain count/measurement with no currency meaning; Percentage = has a % sign or the word "percent"; Boolean = strictly yes/no or true/false.
        - "section": a short label grouping related fields (e.g. "Shipping Details", "Billing Info", "Line Items", "Party Information"; for financial docs: "Assets", "Liabilities", "Equity", "Revenue", "Expenses", "Tax Summary", "Auditor Details" - examples only, name each section after what THIS document actually contains). Reuse the exact same label, character for character, across every field in that group, even across pages. Use "General" if nothing fits.
        - "priority": integer, 1 = most important. Judge freshly per document - key totals/balances, primary IDs, main parties get low numbers; supporting/boilerplate/incidental detail gets higher numbers. Same-section fields usually share similar priority. Never derive it from a fixed rule alone - judge from what this document is actually about.
        """;

    /// <summary>
    /// Reinforces exhaustiveness on dense, tabular documents (financial statements, ledgers,
    /// schedules) where a model is most likely to summarize or truncate instead of listing every
    /// row - the single biggest cause of "missing data" complaints on this kind of document.
    /// </summary>
    private const string CompletenessInstructions = """
        - Never skip, summarize, or truncate any labeled data point, no matter how many are on a page - completeness matters more than brevity.
        - Tables of DATA (schedules, ledgers, transaction rows, asset/liability lists, line items): extract EVERY row as its own field, not just a subtotal or the first few. Build each row's key from its label/description (e.g. "Salary Expense", "Accounts Payable - Vendor X"); if a label repeats within one table, distinguish each occurrence (a date, detail, or index) so rows never collapse into one key.
        - This "every row" rule is for DATA rows only, never for a numbered/lettered list of legal clauses or contract terms (see the boilerplate rule below) - a clause list is prose under headings, not a data table, even though it looks list-like.
        - Copy numeric values (amounts, quantities, percentages) exactly as printed - symbols, separators, decimals, parentheses/minus for negatives - never normalize or reformat.
        """;

    /// <summary>
    /// Filters out two common sources of "junk" extraction on real-world documents: a blank
    /// fill-in line whose only printed content is placeholder characters, and a large block of
    /// fixed legal boilerplate. Also explains how to read the annotation/form-field hint blocks
    /// appended after each page's text.
    /// </summary>
    private const string SignalVsNoiseInstructions = """
        - Only report a value that is actually printed, typed, or filled in - never guess, infer, calculate, or fabricate. When genuinely unsure, leave it out rather than invent one.
        - Underscores, dashes, dots, or blank space after a label (e.g. "Date: ___________") is a blank fill-in line, not a value - never report the underscores/dashes/dots as the "value". If nothing else supplies a real answer (see the next two rules), treat the field as having no value: null in Formatted mode, or don't emit it in Dynamic mode.
        - Some PDFs store the real answer separately - a fillable form field, or a text overlay/annotation on top of a blank line - rather than printed inline. When the document text includes "[Values entered into this PDF's fillable form fields...]" or "[Filled-in values found on this page as separate annotations/overlays...]", those are the real answers: match each one (by field name or the "near <label>" hint) to its blank/underscored field and use it instead of leaving the field blank.
        - Do not extract a block of standard legal/administrative boilerplate (T&Cs, warranty disclaimers, carrier/liability clauses, signature captions, page footers) as data - it's fixed print, not specific to this document. This applies however the block is structured: never dump it into one field's value, and never fragment it into one field per numbered clause/section either (e.g. a bill of lading's "Standard conditions..." page, a loan agreement's numbered covenants) - both are the same boilerplate wall, just formatted differently. Skip the entire block; a single "Terms and Conditions" heading with no value (or omitted entirely) is fine, nothing from inside it.
        - Blank templates often print generic placeholder text instead of leaving a field truly empty (e.g. a "Bill To" block literally printing "Client Company Name"). Treat this like an unfilled line, not a real answer - a good signal: nearby fields in the same block are also genuinely empty, meaning the whole block is unfilled.
        """;

    /// <summary>
    /// Every requested field must be matched to whatever the document itself calls it, not to
    /// the caller's literal wording. Used only in Formatted mode.
    /// </summary>
    private const string FuzzyFieldMatchInstructions = """
        - The document's own label for a requested field is often worded differently (abbreviation, synonym, different order/language - e.g. "Invoice Number" should match "Inv #", "INV No.", "Invoice No", or "Reference No." when it clearly means the same document). Match by MEANING, not exact text - but the "key" in your response must still be the caller's exact requested string, never the document's own wording.
        """;

    /// <summary>
    /// Dynamic mode only - deliberately conservative: a wrong merge is worse than a duplicate
    /// left in place.
    /// </summary>
    private const string DeduplicationInstructions = """
        - Within the SAME page only: if two fields clearly capture the exact same real-world data point (same meaning AND same value), keep the clearer one and drop the duplicate. Never merge just because values coincide. Be conservative - keep both if unsure. Never applies across pages.
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

    private static string BuildDocumentText(IEnumerable<PdfPageTextDto> pages)
    {
        var combinedText = new StringBuilder();
        foreach (var page in pages)
            combinedText.AppendLine($"--- Page {page.PageNumber} ---\n{page.Text}\n");
        return combinedText.ToString();
    }

    public static PromptParts BuildPrompt(IEnumerable<PdfPageTextDto> pages, ExtractionTier tier, IReadOnlyList<string>? requestedFields = null, bool isRetryAfterEmptyResult = false)
    {
        var documentText = BuildDocumentText(pages);
        var retryNote = isRetryAfterEmptyResult
            ? "NOTE: the previous attempt returned no usable fields. Re-examine the document text/images carefully - if there's real visible content, there should be extractable data.\n\n"
            : "";
        var customization = BuildTierCustomizationBlock(tier);

        if (requestedFields is { Count: > 0 })
        {
            var fieldList = string.Join("\n", requestedFields.Select(f => $"- \"{f}\""));
            var systemRules = $"{FuzzyFieldMatchInstructions}\n{TypeAndSectionInstructions}\n{SignalVsNoiseInstructions}\n{customization}";
            var taskInstructions = $$"""
                {{retryNote}}Extract ONLY these fields from the document text above:
                {{fieldList}}

                Rules:
                - "key" = the exact requested name, character for character - never rename/translate.
                - Not present anywhere? Include it with "value": null - never omit it.
                - Add no other fields, even if an image is shown - it's only for locating these fields, not for reporting extra content.
                - Set "page" to the page it appears on, else omit/null.

                Respond with ONLY a JSON array, no prose, no markdown fences:
                [{"key": "Invoice No.", "value": "INV-2024-001", "page": 1, "type": "Reference", "section": "Billing Info", "priority": 1}, ...]
                """;
            return new PromptParts(systemRules, documentText, taskInstructions);
        }

        var dynamicSystemRules = $"{TypeAndSectionInstructions}\n{CompletenessInstructions}\n{SignalVsNoiseInstructions}\n{customization}";
        var dynamicTaskInstructions = $$"""
            {{retryNote}}Extract every meaningful key/value field from the document text above - invoice,
            shipping manifest, contract, financial statement, or any other document type; adapt
            to what's actually there. Process each page independently and be exhaustive: any
            field/table row visibly present on a page must always be extracted, never skipped or
            summarized.

            Rules:
            - "key" = the field's own label from the document, exactly as written - never paraphrase, translate, or rename.
            - The SAME label can appear on multiple pages meaning different things each time - report every page's occurrence separately, never merge or drop one for repeating.
            - A field spanning the whole document goes under the first page it appears on.

            Respond with ONLY a JSON array, no prose, no markdown fences, exactly ONE object per page (matching the "--- Page N ---" markers above):
            [{"page": 1, "fields": [{"key": "Invoice No.", "value": "INV-2024-001", "type": "Reference", "section": "Billing Info", "priority": 1}, {"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}, {"page": 2, "fields": [{"key": "Tax Category", "value": "...", "type": "Generic", "section": "General", "priority": 5}]}]
            """;
        return new PromptParts(dynamicSystemRules, documentText, dynamicTaskInstructions);
    }

    /// <summary>
    /// Second pass: hands the model its own first-pass answer alongside the source text again
    /// and asks it to double-check every value character by character. This "extract, then
    /// verify" pattern catches the single-pass mistakes users see most often.
    ///
    /// Two cost levers, both zero-risk to accuracy because neither changes what the model reads
    /// or how thoroughly it checks - only how much it has to write back and how it's billed:
    /// 1. SPARSE PATCH RESPONSE: the model used to re-emit the ENTIRE field list every verify
    ///    call, correct or not - for a typical document where most fields are already right,
    ///    that's mostly wasted output tokens (billed ~5x input price on Claude). It now returns
    ///    only the corrections/additions/removals - each field carries a stable "i" index (its
    ///    position in `initialFields`) so C# can splice the patch back in deterministically.
    /// 2. CACHE-ALIGNED SYSTEM RULES: SystemRules here is built EXACTLY like BuildPrompt's for
    ///    the same (mode, tier) - same blocks, same order, same customization - so combined with
    ///    the identical DocumentText, the cacheable block this call sends is byte-for-byte the
    ///    one the first pass just sent moments ago. When that combined block clears the
    ///    provider's real caching threshold, this call reads it back at a fraction of normal
    ///    input price instead of paying full price to re-send it. (Previously this block
    ///    silently differed by tier customization and an extra rule block, which meant it could
    ///    never actually match the first pass's cached entry - this fixes that mismatch.)
    /// </summary>
    public static PromptParts BuildVerificationPrompt(IEnumerable<PdfPageTextDto> pages, List<ExtractedFieldDto> initialFields, ExtractionTier tier, bool groupByPage)
    {
        var documentText = BuildDocumentText(pages);
        var customization = BuildTierCustomizationBlock(tier);

        if (groupByPage)
        {
            var grouped = initialFields
                .Select((f, i) => new { f, i })
                .GroupBy(x => x.f.PageNumber ?? 0)
                .Select(g => new { page = g.Key, fields = g.Select(x => new { i = x.i, key = x.f.Key, value = x.f.Value, type = x.f.SemanticType, section = x.f.SectionLabel, priority = x.f.Priority }).ToList() });
            var fieldsJson = JsonSerializer.Serialize(grouped);
            // Identical composition/order to BuildPrompt's dynamic-mode SystemRules - required for cache alignment (see above).
            var systemRules = $"{TypeAndSectionInstructions}\n{CompletenessInstructions}\n{SignalVsNoiseInstructions}\n{customization}";

            var taskInstructions = $$"""
                You previously extracted the fields below, grouped by page, with each field's index "i". Re-check every
                value character by character where it matters (reference numbers, dates, amounts, IDs, codes).

                {{DeduplicationInstructions}}

                Respond with ONLY a JSON object - a SPARSE PATCH, not a full re-list:
                - "corrections": one entry per field that actually needs a change, each giving that field's FULL corrected
                  data: {"i": <its index>, "value": ..., "type": ..., "section": ..., "priority": ...}. Omit any field that's
                  already correct - do not list it.
                - "additions": complete new entries for any row/field the first pass missed: {"page": N, "key": ..., "value": ..., "type": ..., "section": ..., "priority": ...}.
                - "removals": the "i" index of any confirmed same-page duplicate to remove.
                - Never rename a key or move it to a different page via a correction - fields not listed keep their original data exactly.
                - If nothing needs to change, respond with {"corrections":[],"additions":[],"removals":[]}.

                YOUR FIRST-PASS EXTRACTION (grouped by page):
                {{fieldsJson}}

                Example shape: {"corrections":[{"i":2,"value":"INV-2024-001","type":"Reference","section":"Billing Info","priority":1}],"additions":[{"page":1,"key":"PO Number","value":"PO-55","type":"Reference","section":"Billing Info","priority":2}],"removals":[]}
                """;
            return new PromptParts(systemRules, documentText, taskInstructions);
        }

        var flatFieldsJson = JsonSerializer.Serialize(initialFields.Select((f, i) => new { i, key = f.Key, value = f.Value, page = f.PageNumber, type = f.SemanticType, section = f.SectionLabel, priority = f.Priority }));
        // Identical composition/order to BuildPrompt's formatted-mode SystemRules - required for cache alignment (see above).
        var flatSystemRules = $"{FuzzyFieldMatchInstructions}\n{TypeAndSectionInstructions}\n{SignalVsNoiseInstructions}\n{customization}";

        var flatTaskInstructions = $$"""
            You previously extracted the fields below, each with its index "i", from a fixed caller-specified list -
            not open-ended. Re-check every value character by character where it matters.

            Respond with ONLY a JSON object - a SPARSE PATCH, not a full re-list:
            - "corrections": one entry per field that actually needs a change, each giving that field's FULL corrected
              data: {"i": <its index>, "value": ..., "type": ..., "section": ..., "priority": ...}. Omit any field that's
              already correct - do not list it. Never add, remove, or rename a field - only "corrections" apply here.
            - If nothing needs to change, respond with {"corrections":[]}.

            YOUR FIRST-PASS EXTRACTION:
            {{flatFieldsJson}}

            Example shape: {"corrections":[{"i":0,"value":"INV-2024-001","type":"Reference","section":"Billing Info","priority":1}]}
            """;
        return new PromptParts(flatSystemRules, documentText, flatTaskInstructions);
    }

    /// <summary>
    /// Splices a sparse verify patch (see BuildVerificationPrompt) back into the first-pass field
    /// list. Corrections overwrite in place by index, removals filter by (pre-addition) index,
    /// additions append - order mirrors how the model was told to build the patch. Throws on
    /// malformed JSON so the caller's existing try/catch can fall back to the first-pass result
    /// unchanged, same safety net as before this patch format existed.
    /// </summary>
    public static List<ExtractedFieldDto> ApplyVerificationPatch(string rawModelText, List<ExtractedFieldDto> original, bool groupByPage)
    {
        var cleaned = CleanJsonText(rawModelText);
        var patch = JsonSerializer.Deserialize<VerifyPatchJson>(cleaned, JsonOptions) ?? new VerifyPatchJson();

        var result = new List<ExtractedFieldDto>(original);

        if (patch.Corrections is not null)
        {
            foreach (var c in patch.Corrections)
            {
                if (c.I < 0 || c.I >= result.Count) continue; // ignore a bad index rather than let it invalidate an otherwise-good patch
                var existing = result[c.I];
                result[c.I] = existing with
                {
                    Value = c.Value,
                    SemanticType = c.Type ?? existing.SemanticType,
                    SectionLabel = c.Section ?? existing.SectionLabel,
                    Priority = c.Priority ?? existing.Priority
                };
            }
        }

        // Removals reference indices into `original` (pre-addition), so filter before appending additions.
        if (patch.Removals is { Count: > 0 })
        {
            var removeSet = new HashSet<int>(patch.Removals);
            result = result.Where((_, idx) => !removeSet.Contains(idx)).ToList();
        }

        if (groupByPage && patch.Additions is not null)
        {
            foreach (var a in patch.Additions)
                result.Add(new ExtractedFieldDto(a.Key, a.Value, a.Page, a.Type, a.Section, a.Priority));
        }

        return result;
    }

    /// <summary>
    /// Reconciles field labels across an entire batch of independently-extracted documents.
    /// Deliberately conservative - a wrong merge that conflates two genuinely different fields
    /// into one column is worse than leaving two near-duplicate labels unmerged. Not split into
    /// PromptParts: every call's label list is different, so there's nothing cacheable here.
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

    private class VerifyPatchJson
    {
        public List<CorrectionJson>? Corrections { get; set; }
        public List<AdditionJson>? Additions { get; set; }
        public List<int>? Removals { get; set; }
    }

    private class CorrectionJson
    {
        public int I { get; set; }
        public string? Value { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
        public int? Priority { get; set; }
    }

    private class AdditionJson
    {
        public int? Page { get; set; }
        public string Key { get; set; } = default!;
        public string? Value { get; set; }
        public string? Type { get; set; }
        public string? Section { get; set; }
        public int? Priority { get; set; }
    }
}
