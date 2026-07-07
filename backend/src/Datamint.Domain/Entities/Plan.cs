using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// Subscription plan/tier. Pricing and limits are intentionally data-driven
/// (stored in DB, editable from the admin dashboard) instead of hard-coded,
/// since pricing is still to be decided.
/// </summary>
public class Plan : BaseEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public PlanBillingCycle BillingCycle { get; set; } = PlanBillingCycle.Monthly;
    public int MonthlyUploadLimit { get; set; }       // -1 = unlimited
    public bool IsActive { get; set; } = true;
    public string? RazorpayPlanId { get; set; }        // Razorpay-side plan id, once created

    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
}
