using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Every subscription/payment lifecycle email (plan activated, payment succeeded/failed, refund
/// issued, plan expiring soon, cancellation confirmed) goes through here, mirroring
/// IAuthNotificationService's separation for account-lifecycle email.
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
}
