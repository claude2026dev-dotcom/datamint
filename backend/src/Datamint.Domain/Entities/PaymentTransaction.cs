namespace Datamint.Domain.Entities;

public class PaymentTransaction : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public Guid? SubscriptionId { get; set; }

    // Which IPaymentService implementation processed this transaction (e.g. "Fake", "Razorpay") -
    // recorded per-row (not just read from current config) so history stays accurate even after
    // Payment:Provider is later switched to a different gateway.
    public string Provider { get; set; } = default!;
    public string ProviderOrderId { get; set; } = default!;
    public string? ProviderPaymentId { get; set; }
    public string? ProviderSignature { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "INR";
    public string Status { get; set; } = "created"; // created | paid | failed | refunded

    public DateTime? RefundedAtUtc { get; set; }
    public decimal? RefundAmount { get; set; }
    public string? RefundReason { get; set; }
    public string? ProviderRefundId { get; set; }
}
