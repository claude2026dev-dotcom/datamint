using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text (and, when available, page images - see AiFieldExtractionServiceBase) to the
/// Claude API and asks it to return ONLY a JSON array of {"key":..., "value":..., "page":...}
/// objects. Shared extract/verify/retry orchestration lives in the base class; this subclass only
/// knows how to build a Claude Messages API request. The model name is resolved per-call from
/// the caller's ExtractionTier, not static config.
/// >>> Put your Claude API key in appsettings / user-secrets / env var "Claude:ApiKey". <<<
/// </summary>
public class ClaudeFieldExtractionService : AiFieldExtractionServiceBase
{
    private const string ClaudeApiUrl = "https://api.anthropic.com/v1/messages";

    public ClaudeFieldExtractionService(HttpClient http, IConfiguration config, ILogger<ClaudeFieldExtractionService> logger)
        : base(http, config, logger)
    {
    }

    protected override string? ApiKey => Config["Claude:ApiKey"];
    protected override string MissingApiKeyMessage => GenericExtractionFailureMessage;

    protected override async Task<(string? text, string? error)> CallModelAsync(
        string apiKey, string modelName, string prompt, IReadOnlyList<PageImageDto> images, CancellationToken ct)
    {
        var content = new List<object>();
        foreach (var image in images)
        {
            content.Add(new { type = "text", text = $"--- Page {image.PageNumber} (image) ---" });
            content.Add(new
            {
                type = "image",
                source = new { type = "base64", media_type = image.MediaType, data = Convert.ToBase64String(image.ImageBytes) }
            });
        }
        content.Add(new { type = "text", text = prompt });

        var requestBody = new
        {
            model = modelName,
            // A dense, tabular document (a multi-page ledger, balance sheet, or schedule with
            // many line items) can produce a JSON response far larger than a typical invoice's
            // handful of fields - 4096 was silently truncating those responses mid-array.
            max_tokens = 16000,
            temperature = 0, // deterministic extraction - the same document should yield the same fields every time
            messages = new[] { new { role = "user", content = (object)content } }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, ClaudeApiUrl);
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await Http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                Logger.LogError("Claude API error {Status}: {Body}", response.StatusCode, raw);
                return (null, GenericExtractionFailureMessage);
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "[]";
            return (text, null);
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unexpected error calling Claude API");
            return (null, GenericExtractionFailureMessage);
        }
    }
}
