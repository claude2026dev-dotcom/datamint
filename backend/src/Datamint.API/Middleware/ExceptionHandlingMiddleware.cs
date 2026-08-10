using System.Net;
using System.Text.Json;
using Datamint.Application.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Datamint.API.Middleware;

/// <summary>
/// Single place that turns any exception into a clean, consistent JSON error
/// response. ApiException -> mapped status + friendly message. Everything
/// else -> logged with full detail server-side, generic friendly message
/// returned to the client (never leaks stack traces to the UI).
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OAuthException oAuthEx)
        {
            _logger.LogWarning(oAuthEx, "Handled OAuth exception: {Error}", oAuthEx.Error);
            await WriteOAuthResponse(context, oAuthEx);
        }
        catch (ApiException apiEx)
        {
            _logger.LogWarning(apiEx, "Handled API exception: {Message}", apiEx.Message);
            await WriteResponse(context, apiEx.StatusCode, apiEx.Message, apiEx.ErrorCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception on {Path}", context.Request.Path);
            await WriteResponse(context, (int)HttpStatusCode.InternalServerError,
                "Something went wrong on our end. Please try again in a moment.", "INTERNAL_ERROR");
        }
    }

    private static async Task WriteResponse(HttpContext context, int statusCode, string message, string errorCode)
    {
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = statusCode;
        var payload = JsonSerializer.Serialize(new { success = false, message, errorCode });
        await context.Response.WriteAsync(payload);
    }

    /// <summary>RFC 6749 §5.2 error shape - deliberately different from WriteResponse's
    /// {success,message,errorCode} envelope, since /oauth/token's callers are OAuth2 clients
    /// expecting the spec's shape, not this app's own frontend.</summary>
    private static async Task WriteOAuthResponse(HttpContext context, OAuthException ex)
    {
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = ex.StatusCode;
        if (ex.StatusCode == (int)HttpStatusCode.Unauthorized)
            context.Response.Headers.WWWAuthenticate = "Bearer";
        var payload = JsonSerializer.Serialize(new { error = ex.Error, error_description = ex.ErrorDescription });
        await context.Response.WriteAsync(payload);
    }
}
