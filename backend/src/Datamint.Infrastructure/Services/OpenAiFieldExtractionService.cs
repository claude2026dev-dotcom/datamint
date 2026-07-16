using System.Text;
using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends page text to the OpenAI API and asks it to return ONLY a JSON array
/// of {"key":..., "value":..., "page":...} objects, then runs a second
/// self-verification pass over its own answer before returning it (see
/// AiExtractionPromptHelper.BuildVerificationPrompt).
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

    public async Task<AiExtractionResultDto> ExtractStructuredDataAsync(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default)
    {
        var apiKey = _config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false,
                "OpenAI API key is not configured. Set 'OpenAI:ApiKey' in appsettings/user-secrets.");
        }

        var pageList = pages.ToList();
        // Dynamic mode groups the requested/parsed JSON by page so same-named
        // fields on different pages (e.g. "Tax Category" meaning something
        // different per page) can't be silently collapsed into one entry -
        // Formatted mode's caller-specified field list doesn't have that
        // problem, so it keeps the simpler flat shape.
        var isDynamicMode = requestedFields is not { Count: > 0 };

        var firstPassPrompt = AiExtractionPromptHelper.BuildPrompt(pageList, requestedFields);
        var (firstPassText, firstPassError) = await CallOpenAiAsync(apiKey, firstPassPrompt, ct);
        if (firstPassError is not null)
            return new AiExtractionResultDto(new List<ExtractedFieldDto>(), false, firstPassError);

        var firstPassFields = isDynamicMode
            ? AiExtractionPromptHelper.ParsePageGroupedFieldsJson(firstPassText!)
            : AiExtractionPromptHelper.ParseFieldsJson(firstPassText!);

        // Verification pass: if it fails for any reason, fall back to the
        // first-pass result rather than failing the whole extraction over it.
        var verifyPrompt = AiExtractionPromptHelper.BuildVerificationPrompt(pageList, firstPassFields, isDynamicMode);
        var (verifyText, verifyError) = await CallOpenAiAsync(apiKey, verifyPrompt, ct);
        if (verifyError is not null || verifyText is null)
            return new AiExtractionResultDto(firstPassFields, true, null);

        try
        {
            var verifiedFields = isDynamicMode
                ? AiExtractionPromptHelper.ParsePageGroupedFieldsJson(verifyText)
                : AiExtractionPromptHelper.ParseFieldsJson(verifyText);
            return new AiExtractionResultDto(verifiedFields.Count > 0 ? verifiedFields : firstPassFields, true, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenAI verification pass returned unparseable JSON, keeping first-pass result");
            return new AiExtractionResultDto(firstPassFields, true, null);
        }
    }

    public async Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, CancellationToken ct = default)
    {
        if (distinctKeys.Count < 2) return new Dictionary<string, string>();

        var apiKey = _config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) return new Dictionary<string, string>();

        var prompt = AiExtractionPromptHelper.BuildHarmonizationPrompt(distinctKeys);
        var (text, error) = await CallOpenAiAsync(apiKey, prompt, ct);
        if (error is not null || text is null) return new Dictionary<string, string>();

        try
        {
            return AiExtractionPromptHelper.ParseHarmonizationMapping(text);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenAI field-key harmonization returned unparseable JSON; skipping harmonization for this batch");
            return new Dictionary<string, string>();
        }
    }

    private Task<(string? text, string? error)> CallOpenAiAsync(string apiKey, string prompt, CancellationToken ct) =>
        CallOpenAiAsync(apiKey, prompt, includeTemperature: true, ct);

    private async Task<(string? text, string? error)> CallOpenAiAsync(string apiKey, string prompt, bool includeTemperature, CancellationToken ct)
    {
        // A dense, tabular document (a multi-page ledger, balance sheet, or schedule with many
        // line items) can produce a JSON response far larger than a typical invoice's handful of
        // fields - an unset/low cap silently truncates those responses mid-array, which is
        // exactly what "some data missing on some PDFs" looks like from the outside.
        object requestBody = includeTemperature
            ? new { model = _config["OpenAI:Model"] ?? "gpt-4o", temperature = 0, max_tokens = 16000, messages = new[] { new { role = "user", content = prompt } } }
            : new { model = _config["OpenAI:Model"] ?? "gpt-4o", max_tokens = 16000, messages = new[] { new { role = "user", content = prompt } } };

        using var request = new HttpRequestMessage(HttpMethod.Post, OpenAiApiUrl);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        try
        {
            var response = await _http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                // Newer "reasoning" models (o1/o3/gpt-5 family, etc.) reject a custom
                // temperature entirely - only the default (1) is allowed. Rather than
                // hard-coding a model-name allowlist that goes stale the moment OpenAI
                // ships another model family, retry once without it and only surface an
                // error if that retry also fails.
                if (includeTemperature && response.StatusCode == System.Net.HttpStatusCode.BadRequest && RejectsCustomTemperature(raw))
                {
                    _logger.LogWarning("Configured model doesn't support a custom temperature; retrying without it.");
                    return await CallOpenAiAsync(apiKey, prompt, includeTemperature: false, ct);
                }

                _logger.LogError("OpenAI API error {Status}: {Body}", response.StatusCode, raw);
                return (null, $"AI extraction service returned an error (check that 'OpenAI:Model' is a valid, currently-available model id). Please try again shortly.");
            }

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "[]";
            return (text, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error calling OpenAI API");
            return (null, "Unexpected error contacting the AI extraction service.");
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
