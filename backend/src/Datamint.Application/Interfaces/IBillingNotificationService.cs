using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Every subscription/payment lifecycle email (plan activated, payment succeeded/failed +
/// invoice, refund issued, plan expiring soon, abandoned checkout follow-up) goes through here,
/// mirroring IAuthNotificationService's separation for account-lifecycle email - keeps billing
/// copy and templates in one place instead of composed ad-hoc in controllers/background jobs.
/// </summary>
public interface IBillingNotificationService
{
    Task SendPlanActivatedEmailAsync(ApplicationUser user, string planName, CancellationToken ct = default);

    Task SendPaymentSuccessEmailAsync(ApplicationUser user, string planName, decimal amount, string currency,
        string invoiceNumber, DateTime paidAtUtc, CancellationToken ct = default);

    Task SendPaymentFailedEmailAsync(ApplicationUser user, string planName, decimal amount, string currency, CancellationToken ct = default);

    Task SendRefundConfirmationEmailAsync(ApplicationUser user, string planName, decimal refundAmount, string currency, CancellationToken ct = default);

    Task SendPlanExpiryAlertEmailAsync(ApplicationUser user, string planName, DateTime endAtUtc, CancellationToken ct = default);

    /// <summary>Confirms a cancellation was received - distinct from the expiry alert, which
    /// fires later (near EndAtUtc) as a reminder access is about to actually end.</summary>
    Task SendPlanCancelledEmailAsync(ApplicationUser user, string planName, DateTime? endAtUtc, CancellationToken ct = default);

    /// <summary>"Left something in your cart" - a checkout was started (an order/PaymentTransaction
    /// created) but never completed. Sent once per abandoned checkout, well after the fact so it
    /// never fires for someone who's simply mid-payment.</summary>
    Task SendAbandonedCheckoutEmailAsync(ApplicationUser user, string planName, decimal amount, string currency, Guid planId, CancellationToken ct = default);
}
