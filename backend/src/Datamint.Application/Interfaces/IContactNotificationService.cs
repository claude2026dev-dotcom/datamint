namespace Datamint.Application.Interfaces;

/// <summary>Sends a public contact-us submission to the configured App:ContactEmail address so
/// it can be followed up on manually (e.g. to hand-configure a custom Extraction Tier for a
/// prospective customer). No entity/history is kept beyond the EmailLog row SendAsync already
/// writes - this is a lead-capture notification, not a ticketing system.</summary>
public interface IContactNotificationService
{
    Task<bool> SendContactMessageAsync(string name, string email, string message, CancellationToken ct = default);
}
