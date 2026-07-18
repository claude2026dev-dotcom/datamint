using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared orchestration for every AI field-extraction provider - previously duplicated nearly
/// line-for-line between ClaudeFieldExtractionService and OpenAiFieldExtractionService. Each
/// provider subclass owns only its own wire format (how to serialize a prompt + optional images
/// into that provider's specific HTTP request shape) via <see cref="CallModelAsync"/> - this base
/// class deliberately does not try to build a "generic" image content block both providers share,
/// since that's exactly the kind of shared abstraction that drifts the moment one provider's API
/// changes.
/// </summary>
public abstract class AiFieldExtractionServiceBase : IAiFieldExtractionService
{
    protected readonly HttpClient Http;
    protected readonly IConfiguration Config;
    protected readonly ILogger Logger;
    private readonly int _maxEmptyResultRetries;

    protected AiFieldExtractionServiceBase(HttpClient http, IConfiguration config, ILogger logger)
    {
        Http = http;
        Config = config;
        Logger = logger;
        _maxEmptyResultRetries = int.TryParse(config["Ai:MaxEmptyResultRetries"], out var retries) ? retries : 1;
    }

    /// <summary>The provider's own API key config value (e.g. Config["Claude:ApiKey"]).</summary>
    protected abstract string? ApiKey { get; }

    /// <summary>Shown to the caller when <see cref="ApiKey"/> is missing.</summary>
    protected abstract string MissingApiKeyMessage { get; }

    /// <summary>
    /// Sends one prompt (+ optional page images, for vision-capable calls) to the provider and
    /// returns its raw text reply. Each provider builds its own request/content shape here.
    /// </summary>
    protected abstract Task<(string? text, string? error)> CallModelAsync(
        string apiKey, string prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct);

    public async Task<AiExtractionResultDto> ExtractStructuredDataAsync(
        IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default)
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
            var firstPassPrompt = AiExtractionPromptHelper.BuildPrompt(pageList, requestedFields, isRetryAfterEmptyResult: attempt > 0);
            var (firstPassText, firstPassError) = await CallModelAsync(apiKey, firstPassPrompt, images, ct);
            if (firstPassError is not null)
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, firstPassError);

            fields = isDynamicMode
                ? AiExtractionPromptHelper.ParsePageGroupedFieldsJson(firstPassText!)
                : ReconcileFormattedFields(AiExtractionPromptHelper.ParseFieldsJson(firstPassText!), requestedFields!);

            var verifyPrompt = AiExtractionPromptHelper.BuildVerificationPrompt(pageList, fields, isDynamicMode);
            var (verifyText, verifyError) = await CallModelAsync(apiKey, verifyPrompt, Array.Empty<PageImageDto>(), ct);
            if (verifyError is null && verifyText is not null)
            {
                try
                {
                    var verified = isDynamicMode
                        ? AiExtractionPromptHelper.ParsePageGroupedFieldsJson(verifyText)
                        : ReconcileFormattedFields(AiExtractionPromptHelper.ParseFieldsJson(verifyText), requestedFields!);
                    if (verified.Count > 0) fields = verified;
                }
                catch (Exception ex)
                {
                    Logger.LogWarning(ex, "Verification pass returned unparseable JSON, keeping first-pass result");
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
    /// instruction to limit itself and reports everything else it sees in the image too (this
    /// was observed directly: the exact same request came back with 5x the requested field count
    /// once an image was attached, unchanged by strengthening the prompt further). Reconciling
    /// against the caller's exact requested list after every parse guarantees the contract
    /// regardless of what the model actually returns: exactly one entry per requested field, in
    /// the requested order, with the caller's exact casing as the key - extras are dropped,
    /// missing ones become null.
    /// </summary>
    private static List<ExtractedFieldDto> ReconcileFormattedFields(List<ExtractedFieldDto> fields, IReadOnlyList<string> requestedFields)
    {
        var byKey = new Dictionary<string, ExtractedFieldDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in fields)
            if (!byKey.ContainsKey(field.Key)) byKey[field.Key] = field;

        return requestedFields
            .Select(name => byKey.TryGetValue(name, out var f) ? f with { Key = name } : new ExtractedFieldDto(name, null, null))
            .ToList();
    }

    /// <summary>
    /// Dynamic mode: zero fields is a strong failure signal - there's no fixed target to miss, so
    /// an empty result is a real pipeline symptom. Formatted mode: "every requested field is null"
    /// is equally the CORRECT answer when a document genuinely doesn't have what was asked for -
    /// only worth retrying when there's clearly real content to re-examine (a non-trivial amount
    /// of page text), which suggests the miss is a pipeline hiccup rather than the honest truth.
    /// </summary>
    private static bool ShouldRetryEmptyResult(List<ExtractedFieldDto> fields, bool isDynamicMode, List<PdfPageTextDto> pages)
    {
        if (isDynamicMode) return fields.Count == 0;

        var allNull = fields.Count == 0 || fields.All(f => string.IsNullOrWhiteSpace(f.Value));
        if (!allNull) return false;
        return pages.Sum(p => p.Text?.Length ?? 0) > 200;
    }

    public async Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, CancellationToken ct = default)
    {
        if (distinctKeys.Count < 2) return new Dictionary<string, string>();

        var apiKey = ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey)) return new Dictionary<string, string>();

        var prompt = AiExtractionPromptHelper.BuildHarmonizationPrompt(distinctKeys);
        var (text, error) = await CallModelAsync(apiKey, prompt, Array.Empty<PageImageDto>(), ct);
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
