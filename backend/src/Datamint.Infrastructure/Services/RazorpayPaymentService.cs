using System.Security.Cryptography;
using System.Text;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Razorpay.Api;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Wraps the Razorpay Orders API + payment-signature verification.
/// >>> Set "Razorpay:KeyId" and "Razorpay:KeySecret" in appsettings /
///     user-secrets (test keys while integrating, live keys in production). <<<
/// </summary>
public class RazorpayPaymentService : IPaymentService
{
    private readonly IConfiguration _config;

    public RazorpayPaymentService(IConfiguration config) => _config = config;

    public Task<RazorpayOrderDto> CreateOrderAsync(decimal amount, string currency, string receipt, CancellationToken ct = default)
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
        return Task.FromResult(new RazorpayOrderDto(order["id"].ToString()!, amount, currency, keyId));
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
}
