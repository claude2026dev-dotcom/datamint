using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text to the Claude API and asks it to return ONLY a JSON array
/// of {"key":..., "value":..., "page":...} objects.
/// >>> Put your Claude API key in appsettings / user-secrets / env var
///     "Claude:ApiKey" — see appsettings.json placeholder. <<<
/// Active only when "AiProvider:Provider" is "Claude" (the default) — see Program.cs.
/// </summary>
public class ClaudeFieldExtractionService : IAiFieldExtractionService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<ClaudeFieldExtractionService> _logger;
    private const string ClaudeApiUrl = "https://api.anthropic.com/v1/messages";

    public ClaudeFieldExtractionService(HttpClient http, IConfiguration config, ILogger<ClaudeFieldExtractionService> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<AiExtractionResultDto> ExtractStructuredDataAsync(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default)
    {
        var apiKey = _config["Claude:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false,
                "Claude API key is not configured. Set 'Claude:ApiKey' in appsettings/user-secrets.");
        }

        var prompt = AiExtractionPromptHelper.BuildPrompt(pages, requestedFields);

        var requestBody = new
        {
            model = _config["Claude:Model"] ?? "claude-sonnet-5",
            max_tokens = 4096,
            temperature = 0, // deterministic extraction - the same document should yield the same fields every time
            messages = new[] { new { role = "user", content = prompt } }
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
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, "AI extraction service returned an error. Please try again shortly.");
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "[]";
            var fields = AiExtractionPromptHelper.ParseFieldsJson(text);
            return new AiExtractionResultDto(fields, true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error calling Claude API");
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, "Unexpected error contacting the AI extraction service.");
        }
    }
}
