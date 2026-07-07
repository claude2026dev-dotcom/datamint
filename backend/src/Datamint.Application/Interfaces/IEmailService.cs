namespace Datamint.Application.Interfaces;

public interface IEmailService
{
    Task<bool> SendAsync(string toAddress, string subject, string htmlBody, string? attachmentPath = null, string? attachmentName = null, CancellationToken ct = default);
}
