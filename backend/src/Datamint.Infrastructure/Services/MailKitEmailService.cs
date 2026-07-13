using Datamint.Application.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Sends email via MailKit/SMTP.
/// >>> Put your SMTP host/port/username/password in appsettings under
///     "Email:Host", "Email:Port", "Email:Username", "Email:Password",
///     "Email:FromAddress", "Email:FromName" (or user-secrets / env vars). <<<
/// If using Gmail, username/password should be a Google "App Password", not
/// your normal account password.
/// </summary>
public class MailKitEmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<MailKitEmailService> _logger;

    public MailKitEmailService(IConfiguration config, ILogger<MailKitEmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task<bool> SendAsync(string toAddress, string subject, string htmlBody, string? attachmentPath = null, string? attachmentName = null, CancellationToken ct = default)
    {
        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_config["Email:FromName"] ?? _config["App:Name"] ?? "Datamint", _config["Email:FromAddress"]));
            message.To.Add(MailboxAddress.Parse(toAddress));
            message.Subject = subject;

            var builder = new BodyBuilder { HtmlBody = htmlBody };
            if (!string.IsNullOrEmpty(attachmentPath) && File.Exists(attachmentPath))
            {
                builder.Attachments.Add(attachmentName ?? Path.GetFileName(attachmentPath), await File.ReadAllBytesAsync(attachmentPath, ct));
            }
            message.Body = builder.ToMessageBody();

            using var client = new SmtpClient();
            var host = _config["Email:Host"];
            var port = int.Parse(_config["Email:Port"] ?? "587");
            var username = _config["Email:Username"];
            var password = _config["Email:Password"];

            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(username))
            {
                _logger.LogWarning("Email service is not configured (Email:Host / Email:Username missing). Skipping send.");
                return false;
            }

            await client.ConnectAsync(host, port, SecureSocketOptions.StartTls, ct);
            await client.AuthenticateAsync(username, password, ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {ToAddress}", toAddress);
            return false;
        }
    }
}
