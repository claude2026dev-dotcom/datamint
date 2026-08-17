using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text (and, when available, page images - see AiFieldExtractionServiceBase) to the
/// OpenAI API and asks it to return ONLY a JSON array of {"key":..., "value":..., "page":...}
/// objects. Shared extract/verify/retry orchestration lives in the base class; this subclass only
/// knows how to build an OpenAI Chat Completions request. The model name is resolved per-call
/// from the caller's ExtractionTier, not static config.
/// >>> Put your OpenAI API key in appsettings / user-secrets / env var "OpenAI:ApiKey". <<<
/// </summary>
public class OpenAiFieldExtractionService : AiFieldExtractionServiceBase
{
    private const string OpenAiApiUrl = "https://api.openai.com/v1/chat/completions";

    public OpenAiFieldExtractionService(HttpClient http, IConfiguration config, ILogger<OpenAiFieldExtractionService> logger)
        : base(http, config, logger)
    {
    }

    protected override string? ApiKey => Config["OpenAI:ApiKey"];
    protected override string MissingApiKeyMessage => GenericExtractionFailureMessage;

    protected override Task<(string? text, string? error, int inputTokens, int outputTokens)> CallModelAsync(
        string apiKey, string modelName, string prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct) =>
        CallOpenAiAsync(apiKey, modelName, prompt, images, includeTemperature: true, ct);

    private async Task<(string? text, string? error, int inputTokens, int outputTokens)> CallOpenAiAsync(
        string apiKey, string modelName, string prompt, IReadOnlyList<PageImageDto> images, bool includeTemperature, CancellationToken ct)
    {
        // OpenAI's vision cost is tile/detail-based rather than a single dimension knob like
        // Claude's - "low" keeps cost predictable regardless of how large the rendered page is;
        // raise to "high"/"auto" via config if fine-print reading accuracy matters more than cost.
        var imageDetail = Config["OpenAI:ImageDetail"] ?? "low";
        var content = new List<object>();
        foreach (var image in images)
        {
            content.Add(new { type = "text", text = $"--- Page {image.PageNumber} (image) ---" });
            content.Add(new
            {
                type = "image_url",
                image_url = new { url = $"data:{image.MediaType};base64,{Convert.ToBase64String(image.ImageBytes)}", detail = imageDetail }
            });
        }
        content.Add(new { type = "text", text = prompt });

        // A dense, tabular document (a multi-page ledger, balance sheet, or schedule with many
        // line items) can produce a JSON response far larger than a typical invoice's handful of
        // fields - an unset/low cap silently truncates those responses mid-array.
        object requestBody = includeTemperature
            ? new { model = modelName, temperature = 0, max_tokens = 16000, messages = new[] { new { role = "user", content = (object)content } } }
            : new { model = modelName, max_tokens = 16000, messages = new[] { new { role = "user", content = (object)content } } };

        using var request = new HttpRequestMessage(HttpMethod.Post, OpenAiApiUrl);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await Http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                // Newer "reasoning" models (o1/o3/gpt-5 family, etc.) reject a custom
                // temperature entirely - only the default (1) is allowed. Rather than
                // hard-coding a model-name allowlist that goes stale the moment OpenAI ships
                // another model family, retry once without it and only surface an error if
                // that retry also fails.
                if (includeTemperature && response.StatusCode == System.Net.HttpStatusCode.BadRequest && RejectsCustomTemperature(raw))
                {
                    Logger.LogWarning("Configured model doesn't support a custom temperature; retrying without it.");
                    return await CallOpenAiAsync(apiKey, modelName, prompt, images, includeTemperature: false, ct);
                }

                Logger.LogError("OpenAI API error {Status}: {Body}", response.StatusCode, raw);
                return (null, GenericExtractionFailureMessage, 0, 0);
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "[]";
            var usage = doc.RootElement.GetProperty("usage");
            var inputTokens = usage.GetProperty("prompt_tokens").GetInt32();
            var outputTokens = usage.GetProperty("completion_tokens").GetInt32();
            return (text, null, inputTokens, outputTokens);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unexpected error calling OpenAI API");
            return (null, GenericExtractionFailureMessage, 0, 0);
        }
    }

    private static bool RejectsCustomTemperature(string rawErrorBody)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawErrorBody);
            if (!doc.RootElement.TryGetProperty("error", out var error)) return false;
            var param = error.TryGetProperty("param", out var p) ? p.GetString() : null;
            var code = error.TryGetProperty("code", out var c) ? c.GetString() : null;
            return param == "temperature" && code == "unsupported_value";
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
