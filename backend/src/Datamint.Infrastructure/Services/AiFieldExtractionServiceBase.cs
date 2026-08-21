using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared orchestration for every AI field-extraction provider - each provider subclass owns
/// only its own wire format (how to serialize a prompt + optional images + model name into that
/// provider's specific HTTP request shape) via <see cref="CallModelAsync"/>. The model and any
/// prompt customization used for a given call are resolved from the caller's ExtractionTier, not
/// static config - this is what lets an admin map different subscription plans to different
/// models/prompts without either provider class knowing anything about plans or tiers.
/// </summary>
public abstract class AiFieldExtractionServiceBase : IAiFieldExtractionService
{
    /// <summary>The only extraction-failure text ever shown to an end user - identical across
    /// every provider (missing key, non-2xx response, network error, whatever) so a user can
    /// never infer which AI is configured, or that "extraction" is even AI-driven under the
    /// hood, from the wording of a failure. Real detail goes server-side only, via Logger.</summary>
    protected const string GenericExtractionFailureMessage =
        "We couldn't extract data from this document right now. Please try again shortly, or contact support if this continues.";

    protected readonly HttpClient Http;
    protected readonly IConfiguration Config;
    protected readonly ILogger Logger;
    private readonly int _maxEmptyResultRetries;
    private readonly int _maxPagesPerExtractionChunk;
    private readonly List<AiCallUsage> _callUsages = new();

    public IReadOnlyList<AiCallUsage> CallUsages => _callUsages;

    protected AiFieldExtractionServiceBase(HttpClient http, IConfiguration config, ILogger logger)
    {
        Http = http;
        Config = config;
        Logger = logger;
        _maxEmptyResultRetries = int.TryParse(config["Ai:MaxEmptyResultRetries"], out var retries) ? retries : 1;
        // A dense multi-page batch (many line items per page - bulk invoices/bills) can push
        // Dynamic mode's single all-pages-in-one-call JSON response past the model's
        // output-token cap. 3 pages of real-world dense line-item content comfortably fits
        // with room to spare (confirmed against an actual truncation case), so pages beyond
        // this are split into separate calls and merged rather than risking truncation.
        _maxPagesPerExtractionChunk = int.TryParse(config["Ai:MaxPagesPerExtractionChunk"], out var chunkSize) && chunkSize > 0
            ? chunkSize : 3;
    }

    /// <summary>The provider's own API key config value (e.g. Config["Claude:ApiKey"]) - always
    /// a global secret, never per-tier (tiers only ever choose a model/prompt, never hold a
    /// credential).</summary>
    protected abstract string? ApiKey { get; }

    /// <summary>Shown to the caller when <see cref="ApiKey"/> is missing.</summary>
    protected abstract string MissingApiKeyMessage { get; }

    /// <summary>
    /// Sends one prompt (+ optional page images, for vision-capable calls) to the provider using
    /// the given model name and returns its raw text reply. Each provider builds its own
    /// request/content shape here. <see cref="AiExtractionPromptHelper.PromptParts"/> keeps the
    /// cache-friendly (SystemRules, DocumentText) pieces separate from the never-cached
    /// TaskInstructions - a provider without explicit cache support can just concatenate all
    /// three; a caching-aware one (Claude) combines SystemRules+DocumentText into one cacheable
    /// block (see ClaudeFieldExtractionService for why they're combined rather than cached
    /// separately - Claude's real-world minimum cacheable length is higher than either piece
    /// alone tends to be for a typical document).
    /// </summary>
    protected abstract Task<(string? text, string? error, int inputTokens, int outputTokens, int cacheCreationInputTokens, int cacheReadInputTokens)> CallModelAsync(
        string apiKey, string modelName, AiExtractionPromptHelper.PromptParts prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct);

    /// <summary>Every call site goes through here (never CallModelAsync directly) so CallUsages
    /// stays a complete record of every real request this instance made.</summary>
    private async Task<(string? text, string? error)> CallAndRecordAsync(
        string purpose, string apiKey, string modelName, AiExtractionPromptHelper.PromptParts prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct)
    {
        var (text, error, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens) = await CallModelAsync(apiKey, modelName, prompt, images, ct);
        _callUsages.Add(new AiCallUsage(purpose, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens));
        return (text, error);
    }

    public async Task<AiExtractionResultDto> ExtractStructuredDataAsync(
        IEnumerable<PdfPageTextDto> pages, ExtractionTier tier, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default)
    {
        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, MissingApiKeyMessage);

        var pageList = pages.ToList();
        // Dynamic mode groups the requested/parsed JSON by page so same-named fields on
        // different pages (e.g. "Tax Category" meaning something different per page) can't be
        // silently collapsed into one entry - Formatted mode's caller-specified field list
        // doesn't have that problem, so it keeps the simpler flat shape.
        var isDynamicMode = requestedFields is not { Count: > 0 };

        // Only Dynamic mode's response size scales with page count - Formatted mode's output is
        // always bounded by the caller's fixed field list regardless of how many pages it spans,
        // so it's never at risk of the truncation this chunking exists to avoid.
        if (isDynamicMode && pageList.Count > _maxPagesPerExtractionChunk)
        {
            var allFields = new List<ExtractedFieldDto>();
            foreach (var chunk in Chunk(pageList, _maxPagesPerExtractionChunk))
            {
                var chunkResult = await ExtractChunkAsync(chunk, tier, requestedFields, isDynamicMode, apiKey, ct);
                // Fail the whole document rather than silently return a partial result if any
                // chunk fails outright - the caller has no way to tell "partial" from "complete"
                // otherwise, and a silently incomplete extraction is worse than a clear failure.
                if (!chunkResult.Success)
                    return chunkResult;
                allFields.AddRange(chunkResult.Fields);
            }
            return new AiExtractionResultDto(allFields, true, null);
        }

        return await ExtractChunkAsync(pageList, tier, requestedFields, isDynamicMode, apiKey, ct);
    }

    private static IEnumerable<List<PdfPageTextDto>> Chunk(List<PdfPageTextDto> pages, int size)
    {
        for (var i = 0; i < pages.Count; i += size)
            yield return pages.GetRange(i, Math.Min(size, pages.Count - i));
    }

    private async Task<AiExtractionResultDto> ExtractChunkAsync(
        List<PdfPageTextDto> pageList, ExtractionTier tier, IReadOnlyList<string>? requestedFields,
        bool isDynamicMode, string apiKey, CancellationToken ct)
    {
        // Images accompany only the first-pass call (and empty-result retries below) - the
        // verification pass's job is character-by-character digit checking, which the real
        // PdfPig/OCR text already serves at least as well as a downscaled image of a dense
        // table, and skipping it there halves the added image-token cost for free.
        var images = pageList
            .Where(p => p.ImageBytes is { Length: > 0 })
            .Select(p => new PageImageDto(p.PageNumber, p.ImageBytes!, p.ImageMediaType ?? "image/png"))
            .ToList();

        var attempt = 0;
        List<ExtractedFieldDto> fields;
        while (true)
        {
            var firstPassPrompt = AiExtractionPromptHelper.BuildPrompt(pageList, tier, requestedFields, isRetryAfterEmptyResult: attempt > 0);
            var (firstPassText, firstPassError) = await CallAndRecordAsync("FirstPass", apiKey, tier.ModelName, firstPassPrompt, images, ct);
            if (firstPassError is not null)
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, firstPassError);

            try
            {
                fields = isDynamicMode
                    ? AiExtractionPromptHelper.ParsePageGroupedFieldsJson(firstPassText!)
                    : ReconcileFormattedFields(AiExtractionPromptHelper.ParseFieldsJson(firstPassText!), requestedFields!);
            }
            catch (Exception ex)
            {
                // A large batch can push the model's JSON response past its output-token cap,
                // truncating it mid-generation - ParsePageGroupedFieldsJson/ParseFieldsJson
                // already try to salvage every complete element before giving up, so getting
                // here means even that failed. Fail this document gracefully (same sanitized
                // message as every other extraction-failure path) instead of letting the
                // exception bubble up as an unhandled crash.
                Logger.LogError(ex, "First-pass extraction returned unparseable JSON");
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, GenericExtractionFailureMessage);
            }

            var verifyPrompt = AiExtractionPromptHelper.BuildVerificationPrompt(pageList, fields, tier, isDynamicMode);
            var (verifyText, verifyError) = await CallAndRecordAsync("Verify", apiKey, tier.ModelName, verifyPrompt, Array.Empty<PageImageDto>(), ct);
            if (verifyError is null && verifyText is not null)
            {
                try
                {
                    // A patch that parses but changes nothing (empty corrections/additions/removals)
                    // is a normal, desirable outcome now - it means the first pass was already
                    // correct - unlike the old full-re-list format, "no changes" is no longer
                    // indistinguishable from "verify failed", so there's no count>0 check needed here.
                    fields = AiExtractionPromptHelper.ApplyVerificationPatch(verifyText, fields, isDynamicMode);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning(ex, "Verification pass returned unparseable patch, keeping first-pass result");
                }
            }

            if (attempt >= _maxEmptyResultRetries || !ShouldRetryEmptyResult(fields, isDynamicMode, pageList))
                break;

            attempt++;
            Logger.LogWarning("Extraction returned no usable fields, retrying (attempt {Attempt}/{Max})", attempt, _maxEmptyResultRetries);
        }

        return new AiExtractionResultDto(fields, true, null);
    }

    /// <summary>
    /// Formatted mode's "extract ONLY these fields" contract is enforced here in code, not just
    /// via prompt wording - once page images are attached, a model reliably ignores an
    /// instruction to limit itself and reports everything else it sees in the image too.
    /// Reconciling against the caller's exact requested list after every parse guarantees the
    /// contract regardless of what the model actually returns.
    /// </summary>
    private static List<ExtractedFieldDto> ReconcileFormattedFields(List<ExtractedFieldDto> fields, IReadOnlyList<string> requestedFields)
    {
        // Trimmed + case-insensitive on both sides: the model can echo a requested key back
        // with incidental leading/trailing whitespace (or differing case) even though it
        // otherwise matched the right field - neither should ever cause a real match to be
        // missed and silently reported as "not found" (null) instead.
        var byKey = new Dictionary<string, ExtractedFieldDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in fields)
        {
            var trimmedKey = field.Key.Trim();
            if (!byKey.ContainsKey(trimmedKey)) byKey[trimmedKey] = field;
        }

        return requestedFields
            .Select(name => byKey.TryGetValue(name.Trim(), out var f) ? f with { Key = name } : new ExtractedFieldDto(name, null, null))
            .ToList();
    }

    /// <summary>
    /// Dynamic mode: zero fields is a strong failure signal. Formatted mode: "every requested
    /// field is null" is equally the CORRECT answer when a document genuinely doesn't have what
    /// was asked for - only worth retrying when there's clearly real content to re-examine.
    /// </summary>
    private static bool ShouldRetryEmptyResult(List<ExtractedFieldDto> fields, bool isDynamicMode, List<PdfPageTextDto> pages)
    {
        if (isDynamicMode) return fields.Count == 0;

        var allNull = fields.Count == 0 || fields.All(f => string.IsNullOrWhiteSpace(f.Value));
        if (!allNull) return false;
        return pages.Sum(p => p.Text?.Length ?? 0) > 200;
    }

    public async Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, ExtractionTier tier, CancellationToken ct = default)
    {
        if (distinctKeys.Count < 2) return new Dictionary<string, string>();

        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return new Dictionary<string, string>();

        // No SystemRules/DocumentText split here - every batch's label list is different, so
        // there's nothing cacheable to separate out.
        var prompt = new AiExtractionPromptHelper.PromptParts("", "", AiExtractionPromptHelper.BuildHarmonizationPrompt(distinctKeys));
        var (text, error) = await CallAndRecordAsync("Harmonization", apiKey, tier.ModelName, prompt, Array.Empty<PageImageDto>(), ct);
        if (error is not null || text is null) return new Dictionary<string, string>();

        try
        {
            return AiExtractionPromptHelper.ParseHarmonizationMapping(text);
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "Field-key harmonization returned unparseable JSON; skipping harmonization for this batch");
            return new Dictionary<string, string>();
        }
    }
}
