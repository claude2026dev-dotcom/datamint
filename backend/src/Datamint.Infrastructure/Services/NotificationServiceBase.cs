using Datamint.Application.Common;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Shared plumbing for every composed-email service (account lifecycle, billing): resolving
/// the frontend link, applying the app's name/logo branding, and logging every send attempt
/// to EmailLogs. A new notification service only needs to write its own template bodies -
/// not re-derive frontend-URL resolution or logging.
/// </summary>
public abstract class NotificationServiceBase
{
    private readonly IEmailService _email;
    private readonly DatamintDbContext _db;
    private readonly ILogger _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;
    // Only used when there's no request to read Origin/Referer from (e.g. a background
    // job with no HttpContext) - see ResolveFrontendBaseUrl. Not used for a live request.
    private readonly string _fallbackFrontendBaseUrl;
    private readonly string? _logoUrl;
    protected readonly string AppName;

    protected NotificationServiceBase(IEmailService email, DatamintDbContext db, ILogger logger, IConfiguration config, IHttpContextAccessor httpContextAccessor)
    {
        _email = email;
        _db = db;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
        _fallbackFrontendBaseUrl = (config["App:FrontendBaseUrl"] ?? "https://localhost:4200").TrimEnd('/');
        AppName = config["App:Name"] ?? "Datamint";
        _logoUrl = config["App:LogoUrl"];
    }

    /// <summary>
    /// The frontend is reachable at whatever host the browser is currently using - localhost
    /// during dev, an ngrok tunnel while sharing a build, or the real domain in production -
    /// so a link baked in at startup from config would go stale the moment that changes.
    /// The browser's own request already carries that host: same-origin POSTs still send an
    /// Origin header (per the Fetch spec, for any non-GET request), and Referer carries it as
    /// a fallback for any HTTP client that omits Origin. Config is the last resort, for calls
    /// with no HttpContext at all (e.g. a background job).
    /// </summary>
    protected string ResolveFrontendBaseUrl()
    {
        var request = _httpContextAccessor.HttpContext?.Request;
        if (request is null) return _fallbackFrontendBaseUrl;

        var origin = request.Headers.Origin.ToString();
        if (!string.IsNullOrWhiteSpace(origin)) return origin.TrimEnd('/');

        var referer = request.Headers.Referer.ToString();
        if (!string.IsNullOrWhiteSpace(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refererUri))
            return $"{refererUri.Scheme}://{refererUri.Authority}";

        return _fallbackFrontendBaseUrl;
    }

    protected string Wrap(string title, string greeting, string bodyHtml, string? ctaLabel = null, string? ctaPath = null, string? ctaAbsoluteUrl = null)
    {
        var ctaUrl = ctaAbsoluteUrl ?? (ctaPath is not null ? $"{ResolveFrontendBaseUrl()}{ctaPath}" : null);
        return EmailTemplateHelper.Wrap(AppName, title, greeting, bodyHtml, ctaLabel, ctaUrl, _logoUrl);
    }

    protected static string Greeting(ApplicationUser user) =>
        string.IsNullOrWhiteSpace(user.DisplayName) ? "Hi," : $"Hi {user.DisplayName},";

    protected async Task SendAndLog(Guid? userId, string toAddress, string subject, string htmlBody, CancellationToken ct,
        string? attachmentPath = null, string? attachmentName = null)
    {
        var sent = await _email.SendAsync(toAddress, subject, htmlBody, attachmentPath, attachmentName, ct);
        _db.EmailLogs.Add(new EmailLog
        {
            UserId = userId,
            ToAddress = toAddress,
            Subject = subject,
            IsSuccess = sent,
            ErrorMessage = sent ? null : "See application logs for the underlying SMTP error."
        });
        await _db.SaveChangesAsync(ct);

        if (!sent)
            _logger.LogWarning("Notification email {Subject} to {ToAddress} was not sent (see EmailLogs).", subject, toAddress);
    }
}
