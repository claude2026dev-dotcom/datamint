using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// Subscription plan/tier. Pricing and limits are intentionally data-driven (stored in DB,
/// editable from the admin dashboard) instead of hard-coded.
/// </summary>
public class Plan : BaseEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public PlanBillingCycle BillingCycle { get; set; } = PlanBillingCycle.Monthly;
    public int MonthlyPageLimit { get; set; }         // -1 = unlimited. Pages, not uploads/files.
    // false = a one-time lifetime allowance that never renews or resets (e.g. a free trial);
    // true = a normal recurring plan that renews each BillingCycle.
    public bool IsRecurring { get; set; } = true;
    // Marks THE onboarding free trial plan - auto-granted once per user at first sign-in.
    // Never shown as a selectable option on the public pricing page, and can never be
    // (re-)activated a second time by the same user. Looked up by this flag, not by matching
    // Name == "Free", so renaming the plan can never silently break either check.
    public bool IsFreeTrial { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public string? ProviderPlanId { get; set; }        // Gateway-side plan id, once created

    // Which AI provider/model/prompt-customization this plan's extractions use - entirely
    // invisible to the subscriber. Null falls back to the one tier flagged IsDefault.
    public Guid? ExtractionTierId { get; set; }
    public ExtractionTier? ExtractionTier { get; set; }

    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();

    /// <summary>Null for a non-recurring (lifetime) plan - it never needs a renewal date.</summary>
    public DateTime? ComputeSubscriptionEndAt(DateTime fromUtc) =>
        !IsRecurring ? null : (BillingCycle == PlanBillingCycle.Yearly ? fromUtc.AddYears(1) : fromUtc.AddMonths(1));
}
