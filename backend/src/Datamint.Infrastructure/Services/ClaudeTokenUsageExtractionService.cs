using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// One raw Claude Messages API call per document, asking for every field it can find as a flat
/// JSON object. Deliberately not built on AiFieldExtractionServiceBase - that base class's
/// two-pass extract/verify flow and page-chunking would make several Claude calls per document,
/// so the token count a caller sees wouldn't correspond to any single request. This stays a
/// single call so "input tokens" / "output tokens" means exactly what it says.
/// >>> Reuses the same Claude:ApiKey config as the main extraction pipeline. <<<
/// </summary>
public class ClaudeTokenUsageExtractionService : ITokenUsageExtractionService
{
    private const string ClaudeApiUrl = "https://api.anthropic.com/v1/messages";
    private const string DefaultModel = "claude-haiku-4-5-20251001";

    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<ClaudeTokenUsageExtractionService> _logger;

    public ClaudeTokenUsageExtractionService(HttpClient http, IConfiguration config, ILogger<ClaudeTokenUsageExtractionService> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<TokenTestExtractionResultDto> ExtractWithUsageAsync(IReadOnlyList<PdfPageTextDto> pages, CancellationToken ct = default)
    {
        var apiKey = _config["Claude:ApiKey"];
        var model = _config["Claude:DefaultModel"] ?? DefaultModel;
        if (string.IsNullOrWhiteSpace(apiKey))
            return new TokenTestExtractionResultDto(false, null, 0, 0, model, "Claude API key is not configured.");

        var content = new List<object>();
        foreach (var page in pages)
        {
            if (page.ImageBytes is { Length: > 0 })
            {
                content.Add(new { type = "text", text = $"--- Page {page.PageNumber} (image) ---" });
                content.Add(new
                {
                    type = "image",
                    source = new { type = "base64", media_type = page.ImageMediaType ?? "image/jpeg", data = Convert.ToBase64String(page.ImageBytes) }
                });
            }
            else
            {
                content.Add(new { type = "text", text = $"--- Page {page.PageNumber} ---\n{page.Text}" });
            }
        }
        content.Add(new
        {
            type = "text",
            text = "Extract every meaningful field (label/value pair) you can find across all pages above. " +
                   "Return ONLY a single JSON object mapping each field name to its value - no markdown, no code fences, no explanation, just the raw JSON object."
        });

        var requestBody = new
        {
            model,
            max_tokens = 4000,
            temperature = 0,
            messages = new[] { new { role = "user", content = (object)content } }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, ClaudeApiUrl);
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await _http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Claude API error {Status}: {Body}", response.StatusCode, raw);
                return new TokenTestExtractionResultDto(false, null, 0, 0, model, "Claude API request failed.");
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "{}";
            var usage = doc.RootElement.GetProperty("usage");
            var inputTokens = usage.GetProperty("input_tokens").GetInt32();
            var outputTokens = usage.GetProperty("output_tokens").GetInt32();

            return new TokenTestExtractionResultDto(true, StripCodeFence(text), inputTokens, outputTokens, model, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error calling Claude API for token-usage extraction");
            return new TokenTestExtractionResultDto(false, null, 0, 0, model, "Unexpected error calling Claude API.");
        }
    }

    /// <summary>The prompt asks for raw JSON only, but the model sometimes wraps it in a
    /// ```json ... ``` fence anyway - strip that so the caller always gets parseable JSON.</summary>
    private static string StripCodeFence(string text)
    {
        var trimmed = text.Trim();
        if (!trimmed.StartsWith("```")) return trimmed;
        var firstNewline = trimmed.IndexOf('\n');
        if (firstNewline < 0) return trimmed;
        var withoutOpeningFence = trimmed[(firstNewline + 1)..];
        var closingFenceIndex = withoutOpeningFence.LastIndexOf("```", StringComparison.Ordinal);
        return closingFenceIndex >= 0 ? withoutOpeningFence[..closingFenceIndex].Trim() : withoutOpeningFence.Trim();
    }
}
