using System.Security.Cryptography;
using System.Text;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Razorpay.Api;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Razorpay implementation of IPaymentService - wraps the Razorpay Orders/Payments API +
/// payment-signature verification behind the gateway-agnostic interface.
/// >>> Set "Razorpay:KeyId" and "Razorpay:KeySecret" in appsettings / user-secrets (test keys
///     while integrating, live keys in production), and "Payment:Provider" to "Razorpay". <<<
/// </summary>
public class RazorpayPaymentService : IPaymentService
{
    private readonly IConfiguration _config;

    public RazorpayPaymentService(IConfiguration config) => _config = config;

    public string ProviderName => "Razorpay";

    public Task<PaymentOrderDto> CreateOrderAsync(decimal amount, string currency, string receipt, CancellationToken ct = default)
    {
        var keyId = _config["Razorpay:KeyId"]!;
        var keySecret = _config["Razorpay:KeySecret"]!;
        var client = new RazorpayClient(keyId, keySecret);

        var options = new Dictionary<string, object>
        {
            { "amount", (int)(amount * 100) }, // paise
            { "currency", currency },
            { "receipt", receipt },
            { "payment_capture", 1 }
        };

        Order order = client.Order.Create(options);
        return Task.FromResult(new PaymentOrderDto(order["id"].ToString()!, amount, currency, keyId, ProviderName));
    }

    public bool VerifySignature(string orderId, string paymentId, string signature)
    {
        var keySecret = _config["Razorpay:KeySecret"]!;
        var payload = $"{orderId}|{paymentId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(keySecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var expectedSignature = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        // Constant-time comparison: signature verification must not leak timing information.
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expectedSignature),
            Encoding.UTF8.GetBytes(signature.ToLowerInvariant()));
    }

    public Task<RefundResultDto> RefundAsync(string providerPaymentId, decimal amount, string currency, string? reason, CancellationToken ct = default)
    {
        var keyId = _config["Razorpay:KeyId"]!;
        var keySecret = _config["Razorpay:KeySecret"]!;
        var client = new RazorpayClient(keyId, keySecret);

        try
        {
            var options = new Dictionary<string, object> { { "amount", (int)(amount * 100) } };
            Payment payment = client.Payment.Fetch(providerPaymentId);
            Refund refund = payment.Refund(options);
            return Task.FromResult(new RefundResultDto(true, refund["id"].ToString(), null));
        }
        catch (Exception ex)
        {
            return Task.FromResult(new RefundResultDto(false, null, ex.Message));
        }
    }
}
