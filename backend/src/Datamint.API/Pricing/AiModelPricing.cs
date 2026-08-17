namespace Datamint.API.Pricing;

/// <summary>
/// USD-per-million-token rates for computing an estimated cost in the token-usage sample app.
/// Claude rates are Anthropic's published API pricing (platform.claude.com/docs, checked
/// 2026-08-17) - only Claude models are listed since that's the only provider Datamint's seeded
/// ExtractionTiers use; an unrecognized model name (including any OpenAI model) returns null
/// rather than a guessed number. Purely a sample-app convenience - the real product never shows
/// a dollar figure to users.
/// </summary>
internal static class AiModelPricing
{
    private static readonly (string Prefix, decimal InputPerMTok, decimal OutputPerMTok)[] ClaudeRates =
    {
        ("claude-opus-5", 5.00m, 25.00m),
        ("claude-opus-4-5", 5.00m, 25.00m),
        ("claude-sonnet-5", 2.00m, 10.00m),
        ("claude-sonnet-4-5", 3.00m, 15.00m),
        ("claude-haiku-4-5", 1.00m, 5.00m),
        ("claude-haiku-3-5", 0.80m, 4.00m),
    };

    public static (decimal InputPerMTok, decimal OutputPerMTok)? GetRates(string modelName)
    {
        foreach (var (prefix, input, output) in ClaudeRates)
            if (modelName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return (input, output);
        return null;
    }

    public static decimal? CalculateCostUsd(string modelName, int inputTokens, int outputTokens)
    {
        var rates = GetRates(modelName);
        if (rates is null) return null;
        return inputTokens * rates.Value.InputPerMTok / 1_000_000m + outputTokens * rates.Value.OutputPerMTok / 1_000_000m;
    }
}
