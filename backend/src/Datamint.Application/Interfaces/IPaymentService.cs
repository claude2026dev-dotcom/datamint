using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>Thin wrapper around Razorpay so controllers/services never call the SDK directly.</summary>
public interface IPaymentService
{
    Task<RazorpayOrderDto> CreateOrderAsync(decimal amount, string currency, string receipt, CancellationToken ct = default);
    bool VerifySignature(string orderId, string paymentId, string signature);
}
