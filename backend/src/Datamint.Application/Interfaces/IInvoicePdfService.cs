namespace Datamint.Application.Interfaces;

public record InvoicePdfDetails(
    string AppName, string InvoiceNumber, DateTime IssuedAtUtc,
    string CustomerName, string CustomerEmail,
    string PlanName, decimal Amount, string Currency);

/// <summary>Renders a payment receipt as an actual downloadable/printable PDF, attached to the
/// payment-successful email - not just an HTML table in the email body.</summary>
public interface IInvoicePdfService
{
    byte[] Generate(InvoicePdfDetails details);
}
