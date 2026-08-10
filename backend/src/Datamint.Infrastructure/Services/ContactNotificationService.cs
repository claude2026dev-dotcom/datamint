using System.Net;
using Datamint.Application.Common;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>Forwards a public contact-us submission to the configured App:ContactEmail
/// address. Deliberately not built on NotificationServiceBase - that base is shaped around
/// emailing an existing ApplicationUser (greeting, frontend-URL CTA); this is a one-off
/// notification about a lead, not addressed to an account at all.</summary>
public class ContactNotificationService : IContactNotificationService
{
    private readonly IEmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<ContactNotificationService> _logger;

    public ContactNotificationService(IEmailService email, IConfiguration config, ILogger<ContactNotificationService> logger)
    {
        _email = email;
        _config = config;
        _logger = logger;
    }

    public async Task<bool> SendContactMessageAsync(string name, string email, string message, CancellationToken ct = default)
    {
        var appName = _config["App:Name"] ?? "Datamint";
        var contactEmail = _config["App:ContactEmail"];
        if (string.IsNullOrWhiteSpace(contactEmail))
        {
            _logger.LogWarning("App:ContactEmail is not configured - contact-us message from {Email} was not delivered.", email);
            return false;
        }

        var bodyHtml = $"""
            <p><strong>Name:</strong> {WebUtility.HtmlEncode(name)}</p>
            <p><strong>Email:</strong> {WebUtility.HtmlEncode(email)}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap;">{WebUtility.HtmlEncode(message)}</p>
            """;
        var body = EmailTemplateHelper.Wrap(appName, "New contact-us submission", "Hi,", bodyHtml);

        return await _email.SendAsync(contactEmail, $"[{appName}] New contact-us message from {name}", body, ct: ct);
    }
}
