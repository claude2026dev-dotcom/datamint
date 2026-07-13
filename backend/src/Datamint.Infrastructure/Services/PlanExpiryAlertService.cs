using Datamint.Application.Interfaces;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Runs on a timer and emails anyone whose plan is about to lapse - EndAtUtc falls within
/// AlertWindow from now - one alert per subscription (ExpiryAlertSentAtUtc guards against a
/// repeat send on the next sweep). Covers both an Active recurring plan (there's no real
/// auto-renewal/auto-charge wired up yet, so it genuinely will lapse without the user coming
/// back to renew) and a Cancelled plan running out its already-paid-for period - either way,
/// access ends on EndAtUtc unless they act, so the copy is the same for both.
/// </summary>
public class PlanExpiryAlertService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);
    private static readonly TimeSpan AlertWindow = TimeSpan.FromDays(3);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PlanExpiryAlertService> _logger;

    public PlanExpiryAlertService(IServiceScopeFactory scopeFactory, ILogger<PlanExpiryAlertService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SendDueAlertsAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Plan expiry alert sweep failed."); }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (TaskCanceledException) { /* shutting down */ }
        }
    }

    private async Task SendDueAlertsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();
        var billing = scope.ServiceProvider.GetRequiredService<IBillingNotificationService>();

        var now = DateTime.UtcNow;
        var horizon = now.Add(AlertWindow);

        var due = await db.Subscriptions
            .Include(s => s.Plan)
            .Include(s => s.User)
            .Where(s => (s.Status == SubscriptionStatus.Active || s.Status == SubscriptionStatus.Cancelled)
                && s.ExpiryAlertSentAtUtc == null
                && s.EndAtUtc != null && s.EndAtUtc > now && s.EndAtUtc <= horizon)
            .ToListAsync(ct);

        foreach (var sub in due)
        {
            await billing.SendPlanExpiryAlertEmailAsync(sub.User, sub.Plan.Name, sub.EndAtUtc!.Value, ct);
            sub.ExpiryAlertSentAtUtc = now;
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Sent plan-expiry alert for subscription {SubscriptionId} (ends {EndAtUtc}).", sub.Id, sub.EndAtUtc);
        }
    }
}
