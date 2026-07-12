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
    public int MonthlyPageLimit { get; set; }         // -1 = unlimited. Pages, not uploads/files - one upload can hold many files, one file many pages.
    // false = a one-time lifetime allowance that never renews or resets (e.g. a free trial);
    // true = a normal recurring plan that renews each BillingCycle. Configurable per plan
    // from Admin > Plans so this never needs a code change to adjust.
    public bool IsRecurring { get; set; } = true;
    // Marks THE onboarding free trial plan - auto-granted once per user at first
    // sign-in (see AuthController.EnsureFreePlanActivatedAsync) instead of ever being
    // manually chosen. Never shown as a selectable option on the public pricing page,
    // and can never be (re-)activated a second time by the same user - both enforced
    // in SubscriptionController. Looked up by this flag, not by matching Name == "Free",
    // so renaming the plan from Admin > Plans can never silently break either check.
    public bool IsFreeTrial { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public string? RazorpayPlanId { get; set; }        // Razorpay-side plan id, once created

    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();

    /// <summary>Null for a non-recurring (lifetime) plan - it never needs a renewal date.</summary>
    public DateTime? ComputeSubscriptionEndAt(DateTime fromUtc) =>
        !IsRecurring ? null : (BillingCycle == PlanBillingCycle.Yearly ? fromUtc.AddYears(1) : fromUtc.AddMonths(1));
}
