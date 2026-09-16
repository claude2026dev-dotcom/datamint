using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text (and, when available, page images - see AiFieldExtractionServiceBase) to the
/// Gemini API and asks it to return ONLY a JSON array of {"key":..., "value":..., "page":...}
/// objects. Shared extract/verify/retry orchestration lives in the base class; this subclass only
/// knows how to build a Gemini generateContent request. The model name is resolved per-call from
/// the caller's ExtractionTier, not static config - the always-available free tier points this at
/// "gemini-flash-latest" (Google's self-updating alias for their current best free Flash model)
/// rather than a specific version string that would go stale as Google ships new releases.
/// >>> Put your Gemini API key in appsettings / user-secrets / env var "Gemini:ApiKey". <<<
/// </summary>
public class GeminiFieldExtractionService : AiFieldExtractionServiceBase
{
    private const string GeminiApiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

    public GeminiFieldExtractionService(HttpClient http, IConfiguration config, ILogger<GeminiFieldExtractionService> logger)
        : base(http, config, logger)
    {
    }

    protected override string? ApiKey => Config["Gemini:ApiKey"];
    protected override string MissingApiKeyMessage => GenericExtractionFailureMessage;

    protected override async Task<(string? text, string? error, int inputTokens, int outputTokens, int cacheCreationInputTokens, int cacheReadInputTokens, bool wasTruncated)> CallModelAsync(
        string apiKey, string modelName, AiExtractionPromptHelper.PromptParts prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct)
    {
        // Gemini has a native systemInstruction field for exactly the cache-friendly, never-
        // changes-per-request rules block - DocumentText and images go in the user turn alongside
        // TaskInstructions (kept last, matching the other providers' convention), since both of
        // those genuinely differ per call.
        var parts = new List<object>();
        if (!string.IsNullOrEmpty(prompt.DocumentText))
            parts.Add(new { text = prompt.DocumentText });
        foreach (var image in images)
        {
            parts.Add(new { text = $"--- Page {image.PageNumber} (image) ---" });
            parts.Add(new { inlineData = new { mimeType = image.MediaType, data = Convert.ToBase64String(image.ImageBytes) } });
        }
        parts.Add(new { text = prompt.TaskInstructions });

        var requestBody = new
        {
            contents = new[] { new { role = "user", parts = (object)parts } },
            systemInstruction = string.IsNullOrEmpty(prompt.SystemRules)
                ? null
                : new { parts = new[] { new { text = prompt.SystemRules } } },
            generationConfig = new
            {
                temperature = 0, // deterministic extraction - the same document should yield the same fields every time
                // A dense, tabular document (a multi-page ledger, balance sheet, or schedule with
                // many line items) can produce a JSON response far larger than a typical invoice's
                // handful of fields - matches the same cap used for Claude/OpenAI so the shared
                // chunk-sizing/truncation-retry logic in AiFieldExtractionServiceBase behaves
                // identically regardless of which provider a tier resolves to.
                maxOutputTokens = 16000
            }
        };

        var requestJson = JsonSerializer.Serialize(requestBody);
        // Gemini authenticates via an API-key query parameter, not a header - kept out of every
        // log line below (only the response body/status is ever logged) so it never leaks.
        var url = $"{GeminiApiBaseUrl}/{Uri.EscapeDataString(modelName)}:generateContent?key={Uri.EscapeDataString(apiKey)}";

        try
        {
            using var response = await TransientHttpRetry.SendWithRetryAsync(Http, () =>
            {
                var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = new StringContent(requestJson, Encoding.UTF8, "application/json");
                return request;
            }, Logger, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                Logger.LogError("Gemini API error {Status}: {Body}", response.StatusCode, raw);
                return (null, GenericExtractionFailureMessage, 0, 0, 0, 0, false);
            }

            using var doc = JsonDocument.Parse(raw);
            // No candidates at all means the prompt itself was blocked (promptFeedback.blockReason)
            // rather than a normal empty result - same generic failure message as any other
            // provider-side rejection, since the real reason is never something the end user could
            // act on.
            if (!doc.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            {
                Logger.LogError("Gemini API returned no candidates: {Body}", raw);
                return (null, GenericExtractionFailureMessage, 0, 0, 0, 0, false);
            }

            var candidate = candidates[0];
            var text = candidate.TryGetProperty("content", out var content)
                && content.TryGetProperty("parts", out var responseParts) && responseParts.GetArrayLength() > 0
                && responseParts[0].TryGetProperty("text", out var textElement)
                ? textElement.GetString() ?? "[]"
                : "[]";
            // "MAX_TOKENS" here means the response was cut off mid-generation, not that it finished
            // normally at exactly the budget - the caller needs to know this to avoid silently
            // accepting a truncated JSON array as if it were complete.
            var wasTruncated = candidate.TryGetProperty("finishReason", out var finishReason) && finishReason.GetString() == "MAX_TOKENS";

            var inputTokens = 0;
            var outputTokens = 0;
            var cacheReadInputTokens = 0;
            if (doc.RootElement.TryGetProperty("usageMetadata", out var usage))
            {
                inputTokens = usage.TryGetProperty("promptTokenCount", out var p) ? p.GetInt32() : 0;
                outputTokens = usage.TryGetProperty("candidatesTokenCount", out var c) ? c.GetInt32() : 0;
                // Gemini reports implicit-cache hits under usageMetadata.cachedContentTokenCount
                // (no explicit cache-write count the way Claude has) - surfaced as "read", 0 "created".
                cacheReadInputTokens = usage.TryGetProperty("cachedContentTokenCount", out var cc) ? cc.GetInt32() : 0;
            }

            return (text, null, inputTokens, outputTokens, 0, cacheReadInputTokens, wasTruncated);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unexpected error calling Gemini API");
            return (null, GenericExtractionFailureMessage, 0, 0, 0, 0, false);
        }
    }
}
