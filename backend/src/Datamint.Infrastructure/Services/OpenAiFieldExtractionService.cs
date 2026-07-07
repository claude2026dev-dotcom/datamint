using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text to the OpenAI API and asks it to return ONLY a JSON array
/// of {"key":..., "value":..., "page":...} objects.
/// >>> Put your OpenAI API key in appsettings / user-secrets / env var
///     "OpenAI:ApiKey" — see appsettings.json placeholder. <<<
/// Active only when "AiProvider:Provider" is "OpenAI" — see Program.cs.
/// </summary>
public class OpenAiFieldExtractionService : IAiFieldExtractionService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<OpenAiFieldExtractionService> _logger;
    private const string OpenAiApiUrl = "https://api.openai.com/v1/chat/completions";

    public OpenAiFieldExtractionService(HttpClient http, IConfiguration config, ILogger<OpenAiFieldExtractionService> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task<AiExtractionResultDto> ExtractStructuredDataAsync(IEnumerable<PdfPageTextDto> pages, CancellationToken ct = default)
    {
        var apiKey = _config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false,
                "OpenAI API key is not configured. Set 'OpenAI:ApiKey' in appsettings/user-secrets.");
        }

        var prompt = AiExtractionPromptHelper.BuildPrompt(pages);

        var requestBody = new
        {
            model = _config["OpenAI:Model"] ?? "gpt-4o",
            temperature = 0,
            messages = new[] { new { role = "user", content = prompt } }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, OpenAiApiUrl);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await _http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("OpenAI API error {Status}: {Body}", response.StatusCode, raw);
                return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, "AI extraction service returned an error. Please try again shortly.");
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "[]";
            var fields = AiExtractionPromptHelper.ParseFieldsJson(text);
            return new AiExtractionResultDto(fields, true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error calling OpenAI API");
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, "Unexpected error contacting the AI extraction service.");
        }
    }
}
