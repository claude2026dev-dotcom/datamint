using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Abstraction over whichever payment gateway is configured, so controllers/services never
/// call a specific SDK directly. The concrete implementation is a config switch -
/// "Payment:Provider" = "Fake" (default, for local end-to-end testing with no real gateway
/// credentials) or a real gateway name - picked once at DI registration in Program.cs,
/// mirroring the existing "AiProvider:Provider" Claude/OpenAI switch.
/// </summary>
public interface IPaymentService
{
    /// <summary>Stamped onto every PaymentTransaction it creates, so transaction history stays
    /// accurate even after Payment:Provider is later switched to a different gateway.</summary>
    string ProviderName { get; }

    Task<PaymentOrderDto> CreateOrderAsync(decimal amount, string currency, string receipt, CancellationToken ct = default);
    bool VerifySignature(string orderId, string paymentId, string signature);
    Task<RefundResultDto> RefundAsync(string providerPaymentId, decimal amount, string currency, string? reason, CancellationToken ct = default);
}
