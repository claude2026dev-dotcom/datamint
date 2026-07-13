namespace Datamint.Application.DTOs;

public record PlanDto(Guid Id, string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyPageLimit, bool IsRecurring, bool IsActive, bool IsFreeTrial);

public record CreatePlanRequestDto(string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyPageLimit, bool IsRecurring = true, bool IsFreeTrial = false);

public record CreateOrderRequestDto(Guid PlanId);

public record ActivatePlanRequestDto(Guid PlanId);

public record PaymentOrderDto(string OrderId, decimal Amount, string Currency, string KeyId, string Provider);

public record VerifyPaymentRequestDto(Guid PlanId, string ProviderOrderId, string ProviderPaymentId, string ProviderSignature);

public record AdminTransactionDto(
    Guid Id, string UserEmail, string Provider, string ProviderOrderId, string? ProviderPaymentId,
    decimal Amount, string Currency, string Status, DateTime CreatedAtUtc,
    DateTime? RefundedAtUtc, decimal? RefundAmount, string? RefundReason);

public record RefundRequestDto(string? Reason);

public record RefundResultDto(bool Success, string? ProviderRefundId, string? ErrorMessage);

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
