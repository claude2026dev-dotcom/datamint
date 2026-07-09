using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

public class AuthNotificationService : IAuthNotificationService
{
    private readonly IEmailService _email;
    private readonly DatamintDbContext _db;
    private readonly ILogger<AuthNotificationService> _logger;
    private readonly string _frontendBaseUrl;

    public AuthNotificationService(IEmailService email, DatamintDbContext db, ILogger<AuthNotificationService> logger, IConfiguration config)
    {
        _email = email;
        _db = db;
        _logger = logger;
        _frontendBaseUrl = (config["App:FrontendBaseUrl"] ?? "https://localhost:4200").TrimEnd('/');
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
        var resetLink = $"{_frontendBaseUrl}/reset-password?token={Uri.EscapeDataString(rawToken)}";
        var intro = triggeredByAdmin
            ? "<p>An administrator started a password reset for your account. Use the button below to set a new password.</p>"
            : "<p>We received a request to reset your Datamint password. Use the button below to choose a new one.</p>";

        var body = Wrap(
            title: "Reset your password",
            greeting: Greeting(user),
            bodyHtml: intro + "<p style=\"color:#9095b3;font-size:13px;\">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.</p>",
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
                      "<p style=\"color:#9095b3;font-size:13px;\">If you didn't make this change, reset your password immediately and contact support.</p>",
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
                : "<p>An administrator has disabled your Datamint account. You won't be able to sign in until it's re-enabled.</p><p style=\"color:#9095b3;font-size:13px;\">If you believe this is a mistake, please contact support.</p>",
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

    /// <summary>Single shared layout so every account-lifecycle email looks consistent without repeating markup.</summary>
    private string Wrap(string title, string greeting, string bodyHtml, string? ctaLabel, string? ctaPath = null, string? ctaAbsoluteUrl = null)
    {
        var ctaUrl = ctaAbsoluteUrl ?? (ctaPath is not null ? $"{_frontendBaseUrl}{ctaPath}" : null);
        var button = ctaLabel is not null && ctaUrl is not null
            ? $"""<div style="margin:28px 0;"><a href="{ctaUrl}" style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px;display:inline-block;">{ctaLabel}</a></div>"""
            : "";

        return $"""
            <div style="background:#0b0e17;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
              <div style="max-width:480px;margin:0 auto;background:#12172a;border:1px solid #262e4a;border-radius:14px;padding:32px;">
                <div style="font-weight:800;font-size:18px;color:#e5e7f0;margin-bottom:20px;">
                  <span style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff;border-radius:8px;padding:4px 9px;margin-right:8px;">D</span>Datamint
                </div>
                <h2 style="color:#e5e7f0;font-size:20px;margin:0 0 14px;">{title}</h2>
                <p style="color:#e5e7f0;font-size:14px;margin:0 0 6px;">{greeting}</p>
                <div style="color:#e5e7f0;font-size:14px;line-height:1.6;">{bodyHtml}</div>
                {button}
                <p style="color:#5b6180;font-size:12px;margin-top:28px;border-top:1px solid #262e4a;padding-top:16px;">Datamint — AI-powered PDF data extraction.</p>
              </div>
            </div>
            """;
    }
}
