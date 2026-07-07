namespace Datamint.Application.DTOs;

public record PlanDto(Guid Id, string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyUploadLimit, bool IsActive);

public record CreatePlanRequestDto(string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyUploadLimit);

public record CreateOrderRequestDto(Guid PlanId);

public record ActivatePlanRequestDto(Guid PlanId);

public record RazorpayOrderDto(string OrderId, decimal Amount, string Currency, string KeyId);

public record VerifyPaymentRequestDto(Guid PlanId, string RazorpayOrderId, string RazorpayPaymentId, string RazorpaySignature);

public record SubscriptionStatusDto(bool HasActiveSubscription, string? PlanName, DateTime? EndAtUtc, int UploadsUsedThisCycle, int MonthlyUploadLimit);
