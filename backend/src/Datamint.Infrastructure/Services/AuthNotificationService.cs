using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

public class AuthNotificationService : NotificationServiceBase, IAuthNotificationService
{
    public AuthNotificationService(IEmailService email, DatamintDbContext db, ILogger<AuthNotificationService> logger, IConfiguration config, IHttpContextAccessor httpContextAccessor)
        : base(email, db, logger, config, httpContextAccessor)
    {
    }

    public Task SendWelcomeEmailAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var body = Wrap(
            title: $"Welcome to {AppName}",
            greeting: Greeting(user),
            bodyHtml: $"<p>Your account is ready. Upload a PDF and {AppName}'s AI will pull out the fields you need in seconds.</p>",
            ctaLabel: "Start extracting",
            ctaPath: "/upload"
        );
        return SendAndLog(user.Id, user.Email, $"Welcome to {AppName}", body, ct);
    }

    public Task SendPasswordResetEmailAsync(ApplicationUser user, string rawToken, bool triggeredByAdmin, CancellationToken ct = default)
    {
        var resetLink = $"{ResolveFrontendBaseUrl()}/reset-password?token={Uri.EscapeDataString(rawToken)}";
        var intro = triggeredByAdmin
            ? "<p>An administrator started a password reset for your account. Use the button below to set a new password.</p>"
            : $"<p>We received a request to reset your {AppName} password. Use the button below to choose a new one.</p>";

        var body = Wrap(
            title: "Reset your password",
            greeting: Greeting(user),
            bodyHtml: intro + "<p style=\"color:#767b93;font-size:13px;\">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.</p>",
            ctaLabel: "Choose a new password",
            ctaAbsoluteUrl: resetLink
        );
        return SendAndLog(user.Id, user.Email, $"Reset your {AppName} password", body, ct);
    }

    public Task SendPasswordChangedEmailAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your password was changed",
            greeting: Greeting(user),
            bodyHtml: $"<p>Your {AppName} password was just changed. You've been signed out of all devices as a precaution — sign in again with your new password.</p>" +
                      "<p style=\"color:#767b93;font-size:13px;\">If you didn't make this change, reset your password immediately and contact support.</p>",
            ctaLabel: "Sign in",
            ctaPath: "/login"
        );
        return SendAndLog(user.Id, user.Email, $"Your {AppName} password was changed", body, ct);
    }

    public Task SendAccountStatusChangedEmailAsync(ApplicationUser user, bool isActive, CancellationToken ct = default)
    {
        var body = Wrap(
            title: isActive ? "Your account has been re-enabled" : "Your account has been disabled",
            greeting: Greeting(user),
            bodyHtml: isActive
                ? $"<p>Good news — an administrator re-enabled your {AppName} account. You can sign in again.</p>"
                : $"<p>An administrator has disabled your {AppName} account. You won't be able to sign in until it's re-enabled.</p><p style=\"color:#767b93;font-size:13px;\">If you believe this is a mistake, please contact support.</p>",
            ctaLabel: isActive ? "Sign in" : null,
            ctaPath: isActive ? "/login" : null
        );
        return SendAndLog(user.Id, user.Email, isActive ? $"Your {AppName} account was re-enabled" : $"Your {AppName} account was disabled", body, ct);
    }

    public Task SendAccountDeletedEmailAsync(string toAddress, string? displayName, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your account has been deactivated",
            greeting: string.IsNullOrWhiteSpace(displayName) ? "Hi," : $"Hi {displayName},",
            bodyHtml: $"<p>Your {AppName} account has been deactivated and any paid subscription has been cancelled. " +
                      $"Your documents are kept for {ApplicationUser.DeactivationGraceDays} days in case this wasn't intentional — " +
                      $"simply sign in again within that window to reactivate your account exactly as it was.</p>" +
                      $"<p style=\"color:#767b93;font-size:13px;\">After {ApplicationUser.DeactivationGraceDays} days, your account and documents are permanently erased and can't be recovered. " +
                      "If this wasn't you, please contact support right away.</p>",
            ctaLabel: "Sign in to reactivate",
            ctaPath: "/login"
        );
        return SendAndLog(null, toAddress, $"Your {AppName} account has been deactivated", body, ct);
    }
}
