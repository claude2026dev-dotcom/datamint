using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Simulates the full order-create -> pay -> verify -> refund round trip locally, with no
/// external calls and no real gateway credentials, so the whole subscription flow can be
/// tested end-to-end before a real payment provider is chosen. This is the default
/// ("Payment:Provider": "Fake" in appsettings) so the app works out of the box on a fresh
/// clone; switch it to a real provider name once real gateway credentials exist - nothing
/// else in the app needs to change, same pattern as AiProvider:Provider.
///
/// There is no real money and no external actor involved, so "signature verification" here
/// is just a deterministic check that the payment id came from THIS service's own
/// checkout.component.ts simulate-payment flow (which is itself gated behind the caller's own
/// JWT-authenticated order), not a cryptographic guarantee like a real gateway's HMAC.
/// </summary>
public class FakePaymentService : IPaymentService
{
    private const string PaymentIdPrefix = "fake_pay_";
    private const string RefundIdPrefix = "fake_refund_";

    public string ProviderName => "Fake";

    public Task<PaymentOrderDto> CreateOrderAsync(decimal amount, string currency, string receipt, CancellationToken ct = default)
    {
        var orderId = $"fake_order_{Guid.NewGuid():N}";
        return Task.FromResult(new PaymentOrderDto(orderId, amount, currency, "fake_public_key", ProviderName));
    }

    public bool VerifySignature(string orderId, string paymentId, string signature) =>
        paymentId == $"{PaymentIdPrefix}{orderId}" && signature == $"fake_sig_{orderId}";

    public Task<RefundResultDto> RefundAsync(string providerPaymentId, decimal amount, string currency, string? reason, CancellationToken ct = default) =>
        Task.FromResult(new RefundResultDto(true, $"{RefundIdPrefix}{Guid.NewGuid():N}", null));

    public static string BuildFakePaymentId(string orderId) => $"{PaymentIdPrefix}{orderId}";
    public static string BuildFakeSignature(string orderId) => $"fake_sig_{orderId}";
}
