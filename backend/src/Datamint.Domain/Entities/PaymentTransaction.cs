namespace Datamint.Domain.Entities;

public class PaymentTransaction : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public Guid? SubscriptionId { get; set; }
    public string RazorpayOrderId { get; set; } = default!;
    public string? RazorpayPaymentId { get; set; }
    public string? RazorpaySignature { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "INR";
    public string Status { get; set; } = "created"; // created | paid | failed
}
