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
    public int UploadsUsedThisCycle { get; set; }

    public string? RazorpaySubscriptionId { get; set; }
    public string? RazorpayCustomerId { get; set; }
}
