using Datamint.Application.Interfaces;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Runs on a timer and follows up once with anyone who started checkout (created an order/
/// PaymentTransaction) but never completed payment - the "still interested?" lead-recovery
/// email. AbandonedAfter is deliberately well past any real checkout's completion time, so
/// this never fires on someone who's simply mid-payment; AbandonedCheckoutEmailSentAtUtc
/// guards against a repeat send on the next sweep.
/// </summary>
public class AbandonedCheckoutFollowUpService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan AbandonedAfter = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AbandonedCheckoutFollowUpService> _logger;

    public AbandonedCheckoutFollowUpService(IServiceScopeFactory scopeFactory, ILogger<AbandonedCheckoutFollowUpService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SendFollowUpsAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Abandoned checkout follow-up sweep failed."); }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (TaskCanceledException) { /* shutting down */ }
        }
    }

    private async Task SendFollowUpsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();
        var billing = scope.ServiceProvider.GetRequiredService<IBillingNotificationService>();

        var cutoff = DateTime.UtcNow.Subtract(AbandonedAfter);
        var abandoned = await db.PaymentTransactions
            .Include(t => t.User)
            .Where(t => t.Status == "created" && t.AbandonedCheckoutEmailSentAtUtc == null && t.CreatedAtUtc <= cutoff)
            .ToListAsync(ct);

        foreach (var transaction in abandoned)
        {
            var plan = await db.Plans.FindAsync(new object[] { transaction.PlanId }, ct);
            if (plan is not null)
                await billing.SendAbandonedCheckoutEmailAsync(transaction.User, plan.Name, transaction.Amount, transaction.Currency, plan.Id, ct);

            transaction.AbandonedCheckoutEmailSentAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Sent abandoned-checkout follow-up for transaction {TransactionId}.", transaction.Id);
        }
    }
}
