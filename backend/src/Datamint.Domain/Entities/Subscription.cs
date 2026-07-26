using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

public class Subscription : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public Guid PlanId { get; set; }
    public Plan Plan { get; set; } = default!;

    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.None;
    public DateTime StartAtUtc { get; set; }
    public DateTime? EndAtUtc { get; set; }
    public int PagesUsedThisCycle { get; set; }

    public string? ProviderSubscriptionId { get; set; }
    public string? ProviderCustomerId { get; set; }

    // Set once the "your plan ends soon" email has gone out for THIS EndAtUtc, so the
    // background alert job never sends it twice for the same subscription.
    public DateTime? ExpiryAlertSentAtUtc { get; set; }
}
