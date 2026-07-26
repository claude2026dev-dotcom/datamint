namespace Datamint.Domain.Enums;

public enum SubscriptionStatus
{
    None = 0,
    Active = 1,
    PastDue = 2,
    Cancelled = 3,
    Expired = 4
}

public enum PlanBillingCycle
{
    Monthly = 0,
    Yearly = 1
}
