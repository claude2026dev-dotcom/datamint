using System.Collections.Concurrent;
using System.Diagnostics;
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
    private readonly int _maxWordsPerExtractionChunk;
    private readonly int _maxConcurrentChunks;
    // Concurrent chunk processing (see ExtractStructuredDataAsync) means multiple threads can
    // record a call's usage at the same instant - a plain List<T> isn't safe under that, so this
    // is a concurrent collection even though nothing here needs its FIFO ordering guarantee.
    private readonly ConcurrentQueue<AiCallUsage> _callUsages = new();

    public IReadOnlyList<AiCallUsage> CallUsages => _callUsages.ToList();

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
        // Page count alone is a poor proxy for how much a chunk will cost to extract - a
        // line-item-table-heavy page (a bulk utility bill, a detailed ledger) can carry 4-5x the
        // extractable fields of a typical narrative-style page with a similar word count on
        // paper, but a wildly different one once expanded into per-field JSON. Word count is an
        // imperfect but cheap-to-measure, fully general proxy for that density (no knowledge of
        // any specific field name or document type) - capping cumulative words per chunk means a
        // dense document naturally gets smaller chunks (avoiding the output-token cap before ever
        // calling the model) while a normal document is unaffected, since it never approaches the
        // budget within _maxPagesPerExtractionChunk pages anyway. Calibrated from real-world
        // measurement: ~345 words on a genuinely dense line-item page produced ~5,000-5,800 output
        // tokens (~15-17 tokens/word); a 750-word budget stays comfortably under the 16,000-token
        // cap even at that worst-observed expansion rate, leaving headroom for JSON-structure
        // overhead and normal variance. This is a first line of defense, not the only one - the
        // output-truncation retry in ExtractChunkAsync (splitting and re-extracting) still catches
        // any chunk that turns out denser than this estimate predicted, so a bad guess here costs
        // an extra round-trip, never a silently incomplete result.
        _maxWordsPerExtractionChunk = int.TryParse(config["Ai:MaxWordsPerExtractionChunk"], out var wordBudget) && wordBudget > 0
            ? wordBudget : 750;
        // Independent chunks (disjoint page ranges, no shared state) used to be awaited one at a
        // time - for a 10-page document at the default chunk size that's up to 8 sequential
        // Claude round-trips, several minutes of pure waiting even though nothing about chunk 2
        // depends on chunk 1's result. Bounded concurrency instead of unlimited fan-out keeps this
        // from slamming into the provider's per-minute rate limit on a large document.
        _maxConcurrentChunks = int.TryParse(config["Ai:MaxConcurrentChunks"], out var maxConcurrent) && maxConcurrent > 0
            ? maxConcurrent : 4;
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
    protected abstract Task<(string? text, string? error, int inputTokens, int outputTokens, int cacheCreationInputTokens, int cacheReadInputTokens, bool wasTruncated)> CallModelAsync(
        string apiKey, string modelName, AiExtractionPromptHelper.PromptParts prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct);

    /// <summary>Every call site goes through here (never CallModelAsync directly) so CallUsages
    /// stays a complete record of every real request this instance made.</summary>
    private async Task<(string? text, string? error, bool wasTruncated)> CallAndRecordAsync(
        string purpose, string apiKey, string modelName, AiExtractionPromptHelper.PromptParts prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        var (text, error, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, wasTruncated) = await CallModelAsync(apiKey, modelName, prompt, images, ct);
        stopwatch.Stop();
        _callUsages.Enqueue(new AiCallUsage(purpose, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, stopwatch.ElapsedMilliseconds));
        return (text, error, wasTruncated);
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
        if (isDynamicMode && (pageList.Count > _maxPagesPerExtractionChunk || TotalWordCount(pageList) > _maxWordsPerExtractionChunk))
        {
            var chunks = Chunk(pageList, _maxPagesPerExtractionChunk, _maxWordsPerExtractionChunk).ToList();

            // Each chunk is a fully independent extraction over its own disjoint page range - no
            // chunk reads another's output, so there is no correctness reason to serialize them.
            // A SemaphoreSlim bounds how many run at once rather than firing all of them at the
            // provider simultaneously, which on a large document would risk tripping its
            // requests/tokens-per-minute limit instead of actually finishing faster.
            using var throttle = new SemaphoreSlim(_maxConcurrentChunks);
            var chunkTasks = chunks.Select(async chunk =>
            {
                await throttle.WaitAsync(ct);
                try
                {
                    return await ExtractChunkAsync(chunk, tier, requestedFields, isDynamicMode, apiKey, ct);
                }
                finally
                {
                    throttle.Release();
                }
            }).ToList();

            // Task.WhenAll's result array mirrors the input task array's order (not completion
            // order), so chunk 1's fields still precede chunk 2's below even though chunk 2 may
            // finish first.
            var chunkResults = await Task.WhenAll(chunkTasks);

            // Fail the whole document rather than silently return a partial result if any chunk
            // failed outright - the caller has no way to tell "partial" from "complete" otherwise,
            // and a silently incomplete extraction is worse than a clear failure. Waiting for every
            // chunk before checking (rather than cancelling siblings on the first failure) costs at
            // most one chunk's worth of extra latency and keeps this simple - failures are rare.
            var firstFailure = chunkResults.FirstOrDefault(r => !r.Success);
            if (firstFailure is not null)
                return firstFailure;

            var allFields = chunkResults.SelectMany(r => r.Fields).ToList();
            return new AiExtractionResultDto(allFields, true, null);
        }

        return await ExtractChunkAsync(pageList, tier, requestedFields, isDynamicMode, apiKey, ct);
    }

    /// <summary>Splits pages into chunks bounded by both a page-count ceiling and a cumulative
    /// word-count budget (see _maxWordsPerExtractionChunk) - whichever limit is hit first ends
    /// the current chunk. A single page always forms its own chunk even if it alone exceeds the
    /// word budget; there's nothing smaller to split it into here.</summary>
    private static IEnumerable<List<PdfPageTextDto>> Chunk(List<PdfPageTextDto> pages, int maxPages, int maxWords)
    {
        var current = new List<PdfPageTextDto>();
        var currentWords = 0;
        foreach (var page in pages)
        {
            var pageWords = WordCount(page.Text);
            if (current.Count > 0 && (current.Count >= maxPages || currentWords + pageWords > maxWords))
            {
                yield return current;
                current = new List<PdfPageTextDto>();
                currentWords = 0;
            }
            current.Add(page);
            currentWords += pageWords;
        }
        if (current.Count > 0) yield return current;
    }

    private static int TotalWordCount(IEnumerable<PdfPageTextDto> pages) => pages.Sum(p => WordCount(p.Text));

    private static int WordCount(string? text) =>
        string.IsNullOrWhiteSpace(text) ? 0 : text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;

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
            var (firstPassText, firstPassError, firstPassTruncated) = await CallAndRecordAsync("FirstPass", apiKey, tier.ModelName, firstPassPrompt, images, ct);
            if (firstPassError is not null)
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, firstPassError);

            // The model hit its output-token cap mid-generation - whatever ParsePageGroupedFieldsJson/
            // ParseFieldsJson salvages below is a response cut off partway through, silently missing
            // every field after that point. A page-count-based chunk size can't predict this in
            // advance (a dense line-item table produces far more output per page than a typical
            // document), so instead of accepting the partial result, split this chunk in half and
            // retry each half - halving the fields-per-call means halving the output size, which
            // reliably clears the cap. Only bottoms out at "accept the salvage" for an already
            // single-page chunk, where there's nothing left to split.
            if (firstPassTruncated && pageList.Count > 1)
            {
                Logger.LogWarning(
                    "First-pass response hit the model's output-token cap on a {PageCount}-page chunk; splitting and retrying instead of keeping a truncated result.",
                    pageList.Count);
                var mid = pageList.Count / 2;
                var firstHalfTask = ExtractChunkAsync(pageList.GetRange(0, mid), tier, requestedFields, isDynamicMode, apiKey, ct);
                var secondHalfTask = ExtractChunkAsync(pageList.GetRange(mid, pageList.Count - mid), tier, requestedFields, isDynamicMode, apiKey, ct);
                var halves = await Task.WhenAll(firstHalfTask, secondHalfTask);
                var failedHalf = halves.FirstOrDefault(r => !r.Success);
                if (failedHalf is not null) return failedHalf;
                return new AiExtractionResultDto(halves.SelectMany(r => r.Fields).ToList(), true, null);
            }

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
            var (verifyText, verifyError, _) = await CallAndRecordAsync("Verify", apiKey, tier.ModelName, verifyPrompt, Array.Empty<PageImageDto>(), ct);
            if (verifyError is null && verifyText is not null)
            {
                try
                {
                    // A patch that parses but changes nothing (empty corrections/additions/removals)
                    // is a normal, desirable outcome now - it means the first pass was already
                    // correct - unlike the old full-re-list format, "no changes" is no longer
                    // indistinguishable from "verify failed", so there's no count>0 check needed here.
                    fields = AiExtractionPromptHelper.ApplyVerificationPatch(verifyText, fields, isDynamicMode, Logger);
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
        var (text, error, _) = await CallAndRecordAsync("Harmonization", apiKey, tier.ModelName, prompt, Array.Empty<PageImageDto>(), ct);
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
