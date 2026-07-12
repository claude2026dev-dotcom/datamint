namespace Datamint.Application.DTOs;

public record PlanDto(Guid Id, string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyPageLimit, bool IsRecurring, bool IsActive, bool IsFreeTrial);

public record CreatePlanRequestDto(string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyPageLimit, bool IsRecurring = true, bool IsFreeTrial = false);

public record CreateOrderRequestDto(Guid PlanId);

public record ActivatePlanRequestDto(Guid PlanId);

public record RazorpayOrderDto(string OrderId, decimal Amount, string Currency, string KeyId);

public record VerifyPaymentRequestDto(Guid PlanId, string RazorpayOrderId, string RazorpayPaymentId, string RazorpaySignature);

public record SubscriptionStatusDto(
    bool HasActiveSubscription,
    Guid? PlanId,
    string? PlanName,
    decimal? Price,
    string? Currency,
    string? BillingCycle,
    string? Status,
    DateTime? StartAtUtc,
    DateTime? EndAtUtc,
    int PagesUsedThisCycle,
    int MonthlyPageLimit,
    bool IsRecurring,
    bool CancelAtPeriodEnd);
