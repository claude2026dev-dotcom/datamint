using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared retry-with-backoff for the AI provider HTTP calls (Claude, OpenAI) - a 429 (rate
/// limited) or 5xx (transient provider-side failure) is retried a few times with exponential
/// backoff before being treated as a real failure; every other status is returned immediately,
/// unretried, since retrying a 400/401/404 just wastes time repeating a request that can never
/// succeed. Made more important now that chunk extraction runs several requests concurrently
/// (see AiFieldExtractionServiceBase.ExtractStructuredDataAsync) rather than one at a time, which
/// raises the odds of a burst tripping the provider's per-minute limit on a large document.
/// </summary>
internal static class TransientHttpRetry
{
    private const int MaxAttempts = 3;

    public static async Task<HttpResponseMessage> SendWithRetryAsync(
        HttpClient http, Func<HttpRequestMessage> requestFactory, ILogger logger, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            // A sent HttpRequestMessage can't be resent - the factory rebuilds a fresh one each
            // attempt rather than trying to reuse/reset the previous one.
            using var request = requestFactory();
            var response = await http.SendAsync(request, ct);

            var isRetryable = (int)response.StatusCode == 429 || (int)response.StatusCode >= 500;
            if (!isRetryable || attempt >= MaxAttempts)
                return response;

            var delay = GetRetryDelay(response, attempt);
            logger.LogWarning(
                "Transient AI API error {Status} on attempt {Attempt}/{Max}, retrying in {DelayMs}ms",
                response.StatusCode, attempt, MaxAttempts, delay.TotalMilliseconds);
            response.Dispose();
            await Task.Delay(delay, ct);
        }
    }

    private static TimeSpan GetRetryDelay(HttpResponseMessage response, int attempt)
    {
        // Honor the provider's own guidance when it gives one (Claude and OpenAI both send
        // Retry-After on 429s) rather than guessing a backoff it didn't ask for.
        if (response.Headers.RetryAfter?.Delta is { } delta)
            return delta;

        var backoffMs = 500 * Math.Pow(2, attempt - 1);
        var jitterMs = Random.Shared.Next(0, 250);
        return TimeSpan.FromMilliseconds(backoffMs + jitterMs);
    }
}
