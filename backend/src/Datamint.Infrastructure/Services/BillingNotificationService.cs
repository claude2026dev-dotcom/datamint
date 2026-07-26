using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>Every subscription/payment lifecycle email (plan activated, payment succeeded/
/// failed, refund issued, plan expiring soon, cancellation confirmed) goes through here,
/// mirroring IAuthNotificationService's separation for account-lifecycle email.</summary>
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
        var body = Wrap(
            title: "Payment successful",
            greeting: Greeting(user),
            bodyHtml: $"<p>Thanks — your payment of <strong>{currency} {amount:0.00}</strong> went through and your <strong>{planName}</strong> plan is active.</p>" +
                      $"<p style=\"color:#767b93;font-size:13px;\">Receipt reference: {invoiceNumber} · Paid {paidAtUtc:MMM d, yyyy}</p>",
            ctaLabel: "Start extracting",
            ctaPath: "/upload"
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
                      "Renew before then to keep uninterrupted access.</p>",
            ctaLabel: "Renew my plan",
            ctaPath: "/plans"
        );
        return SendAndLog(user.Id, user.Email, $"Your {planName} plan ends {endAtUtc:MMM d}", body, ct);
    }

    public Task SendPlanCancelledEmailAsync(ApplicationUser user, string planName, DateTime? endAtUtc, CancellationToken ct = default)
    {
        var accessNote = endAtUtc is not null
            ? $"You'll keep access to <strong>{planName}</strong> until <strong>{endAtUtc:MMM d, yyyy}</strong>."
            : $"Your <strong>{planName}</strong> plan has been cancelled.";

        var body = Wrap(
            title: "Your plan has been cancelled",
            greeting: Greeting(user),
            bodyHtml: $"<p>We've cancelled auto-renewal on your <strong>{planName}</strong> plan as requested. {accessNote}</p>" +
                      "<p style=\"color:#767b93;font-size:13px;\">Changed your mind? You can resubscribe any time before or after your access ends.</p>",
            ctaLabel: "View plans",
            ctaPath: "/plans"
        );
        return SendAndLog(user.Id, user.Email, $"Your {planName} plan has been cancelled", body, ct);
    }
}
