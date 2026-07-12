using Datamint.Application.Common;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

public class AuthNotificationService : IAuthNotificationService
{
    private readonly IEmailService _email;
    private readonly DatamintDbContext _db;
    private readonly ILogger<AuthNotificationService> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;
    // Only used when there's no request to read Origin/Referer from (e.g. a background
    // job with no HttpContext) - see ResolveFrontendBaseUrl. Not used for a live request.
    private readonly string _fallbackFrontendBaseUrl;

    public AuthNotificationService(IEmailService email, DatamintDbContext db, ILogger<AuthNotificationService> logger, IConfiguration config, IHttpContextAccessor httpContextAccessor)
    {
        _email = email;
        _db = db;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
        _fallbackFrontendBaseUrl = (config["App:FrontendBaseUrl"] ?? "https://localhost:4200").TrimEnd('/');
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
    private string ResolveFrontendBaseUrl()
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

    public Task SendWelcomeEmailAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Welcome to Datamint",
            greeting: Greeting(user),
            bodyHtml: "<p>Your account is ready. Upload a PDF and Datamint's AI will pull out the fields you need in seconds.</p>",
            ctaLabel: "Start extracting",
            ctaPath: "/upload"
        );
        return SendAndLog(user.Id, user.Email, "Welcome to Datamint", body, ct);
    }

    public Task SendPasswordResetEmailAsync(ApplicationUser user, string rawToken, bool triggeredByAdmin, CancellationToken ct = default)
    {
        var resetLink = $"{ResolveFrontendBaseUrl()}/reset-password?token={Uri.EscapeDataString(rawToken)}";
        var intro = triggeredByAdmin
            ? "<p>An administrator started a password reset for your account. Use the button below to set a new password.</p>"
            : "<p>We received a request to reset your Datamint password. Use the button below to choose a new one.</p>";

        var body = Wrap(
            title: "Reset your password",
            greeting: Greeting(user),
            bodyHtml: intro + "<p style=\"color:#767b93;font-size:13px;\">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.</p>",
            ctaLabel: "Choose a new password",
            ctaAbsoluteUrl: resetLink
        );
        return SendAndLog(user.Id, user.Email, "Reset your Datamint password", body, ct);
    }

    public Task SendPasswordChangedEmailAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your password was changed",
            greeting: Greeting(user),
            bodyHtml: "<p>Your Datamint password was just changed. You've been signed out of all devices as a precaution — sign in again with your new password.</p>" +
                      "<p style=\"color:#767b93;font-size:13px;\">If you didn't make this change, reset your password immediately and contact support.</p>",
            ctaLabel: "Sign in",
            ctaPath: "/login"
        );
        return SendAndLog(user.Id, user.Email, "Your Datamint password was changed", body, ct);
    }

    public Task SendAccountStatusChangedEmailAsync(ApplicationUser user, bool isActive, CancellationToken ct = default)
    {
        var body = Wrap(
            title: isActive ? "Your account has been re-enabled" : "Your account has been disabled",
            greeting: Greeting(user),
            bodyHtml: isActive
                ? "<p>Good news — an administrator re-enabled your Datamint account. You can sign in again.</p>"
                : "<p>An administrator has disabled your Datamint account. You won't be able to sign in until it's re-enabled.</p><p style=\"color:#767b93;font-size:13px;\">If you believe this is a mistake, please contact support.</p>",
            ctaLabel: isActive ? "Sign in" : null,
            ctaPath: isActive ? "/login" : null
        );
        return SendAndLog(user.Id, user.Email, isActive ? "Your Datamint account was re-enabled" : "Your Datamint account was disabled", body, ct);
    }

    public Task SendAccountDeletedEmailAsync(string toAddress, string? displayName, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your account has been deleted",
            greeting: string.IsNullOrWhiteSpace(displayName) ? "Hi," : $"Hi {displayName},",
            bodyHtml: "<p>Your Datamint account and its data have been deleted. If this wasn't you, please contact support right away.</p>",
            ctaLabel: null,
            ctaPath: null
        );
        return SendAndLog(null, toAddress, "Your Datamint account has been deleted", body, ct);
    }

    private static string Greeting(ApplicationUser user) =>
        string.IsNullOrWhiteSpace(user.DisplayName) ? "Hi," : $"Hi {user.DisplayName},";

    private async Task SendAndLog(Guid? userId, string toAddress, string subject, string htmlBody, CancellationToken ct)
    {
        var sent = await _email.SendAsync(toAddress, subject, htmlBody, ct: ct);
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
            _logger.LogWarning("Auth notification email {Subject} to {ToAddress} was not sent (see EmailLogs).", subject, toAddress);
    }

    private string Wrap(string title, string greeting, string bodyHtml, string? ctaLabel, string? ctaPath = null, string? ctaAbsoluteUrl = null)
    {
        var ctaUrl = ctaAbsoluteUrl ?? (ctaPath is not null ? $"{ResolveFrontendBaseUrl()}{ctaPath}" : null);
        return EmailTemplateHelper.Wrap(title, greeting, bodyHtml, ctaLabel, ctaUrl);
    }
}
