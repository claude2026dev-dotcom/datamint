using Datamint.Application.Common;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

public class BillingNotificationService : NotificationServiceBase, IBillingNotificationService
{
    public BillingNotificationService(IEmailService email, DatamintDbContext db, ILogger<BillingNotificationService> logger, IConfiguration config, IHttpContextAccessor httpContextAccessor)
        : base(email, db, logger, config, httpContextAccessor)
    {
    }

    public Task SendPlanActivatedEmailAsync(ApplicationUser user, string planName, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your plan is active",
            greeting: Greeting(user),
            bodyHtml: $"<p>Your <strong>{planName}</strong> plan is active — nothing to pay, nothing else to do. You're ready to start extracting.</p>",
            ctaLabel: "Start extracting",
            ctaPath: "/upload"
        );
        return SendAndLog(user.Id, user.Email, $"Your {planName} plan is active", body, ct);
    }

    public Task SendPaymentSuccessEmailAsync(ApplicationUser user, string planName, decimal amount, string currency,
        string invoiceNumber, DateTime paidAtUtc, CancellationToken ct = default)
    {
        var table = EmailTemplateHelper.InvoiceTable(
            invoiceNumber, paidAtUtc,
            lines: new[] { (planName + " plan", $"{currency} {amount:0.00}") },
            totalLabel: "Total paid", totalValue: $"{currency} {amount:0.00}");

        var body = Wrap(
            title: "Payment successful",
            greeting: Greeting(user),
            bodyHtml: $"<p>Thanks — your payment went through and your <strong>{planName}</strong> plan is active.</p>{table}" +
                      "<p style=\"color:#767b93;font-size:13px;\">Keep this email as your receipt for this payment.</p>",
            ctaLabel: "Go to my documents",
            ctaPath: "/documents"
        );
        return SendAndLog(user.Id, user.Email, $"Payment successful — {invoiceNumber}", body, ct);
    }

    public Task SendPaymentFailedEmailAsync(ApplicationUser user, string planName, decimal amount, string currency, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Payment failed",
            greeting: Greeting(user),
            bodyHtml: $"<p>We couldn't complete your payment of {currency} {amount:0.00} for the <strong>{planName}</strong> plan. " +
                      "Your plan has not been activated and you have not been charged.</p>" +
                      "<p style=\"color:#767b93;font-size:13px;\">If an amount was debited from your account regardless, please contact support with this email as reference.</p>",
            ctaLabel: "Try again",
            ctaPath: "/plans"
        );
        return SendAndLog(user.Id, user.Email, "Payment failed", body, ct);
    }

    public Task SendRefundConfirmationEmailAsync(ApplicationUser user, string planName, decimal refundAmount, string currency, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Refund issued",
            greeting: Greeting(user),
            bodyHtml: $"<p>A refund of <strong>{currency} {refundAmount:0.00}</strong> for your <strong>{planName}</strong> plan has been issued " +
                      "and access to that plan has ended immediately.</p>" +
                      "<p style=\"color:#767b93;font-size:13px;\">Refunds are typically returned to your original payment method within 5–7 business days, depending on your bank or card issuer.</p>",
            ctaLabel: "View plans",
            ctaPath: "/plans"
        );
        return SendAndLog(user.Id, user.Email, "Your refund has been issued", body, ct);
    }

    public Task SendPlanExpiryAlertEmailAsync(ApplicationUser user, string planName, DateTime endAtUtc, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Your plan ends soon",
            greeting: Greeting(user),
            bodyHtml: $"<p>Your <strong>{planName}</strong> plan ends on <strong>{endAtUtc:MMM d, yyyy}</strong>. " +
                      "Renew before then to keep uninterrupted access — after that date you'll be moved to the Free plan.</p>",
            ctaLabel: "Renew my plan",
            ctaPath: "/plans"
        );
        return SendAndLog(user.Id, user.Email, $"Your {planName} plan ends {endAtUtc:MMM d}", body, ct);
    }

    public Task SendAbandonedCheckoutEmailAsync(ApplicationUser user, string planName, decimal amount, string currency, Guid planId, CancellationToken ct = default)
    {
        var body = Wrap(
            title: "Still interested?",
            greeting: Greeting(user),
            bodyHtml: $"<p>You started checking out for the <strong>{planName}</strong> plan ({currency} {amount:0.00}) but didn't finish. " +
                      "Your cart's still here whenever you're ready — it only takes a minute.</p>",
            ctaLabel: $"Finish subscribing to {planName}",
            ctaPath: $"/checkout/{planId}"
        );
        return SendAndLog(user.Id, user.Email, $"Complete your {planName} subscription", body, ct);
    }
}
