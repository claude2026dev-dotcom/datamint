using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Runs on a timer and permanently erases any account that's been deactivated for
/// longer than ApplicationUser.DeactivationGraceDays: deletes the user's uploaded PDF
/// files off disk, their Document rows (Pages/ExtractedFields cascade with them),
/// and their refresh/password-reset tokens, then anonymizes the user row itself so
/// nothing personally identifying about them remains queryable.
///
/// Subscriptions, PaymentTransactions, and AuditLogs are deliberately left alone -
/// they carry their own financial/audit retention obligations that GDPR's
/// right-to-erasure explicitly allows to override a deletion request (Art. 17(3)(b)/(e)),
/// and a Restrict delete behavior on Subscription.UserId means hard-deleting the User
/// row outright isn't even possible - anonymizing it is both the correct and the only
/// available option.
/// </summary>
public class AccountPurgeService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AccountPurgeService> _logger;

    public AccountPurgeService(IServiceScopeFactory scopeFactory, ILogger<AccountPurgeService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PurgeExpiredAccountsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Account purge sweep failed.");
            }

            try { await Task.Delay(CheckInterval, stoppingToken); }
            catch (TaskCanceledException) { /* shutting down */ }
        }
    }

    private async Task PurgeExpiredAccountsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();

        var cutoff = DateTime.UtcNow.AddDays(-ApplicationUser.DeactivationGraceDays);
        var toPurge = await db.Users.IgnoreQueryFilters()
            .Where(u => u.IsDeleted && u.PurgedAtUtc == null && u.DeactivatedAtUtc != null && u.DeactivatedAtUtc <= cutoff)
            .ToListAsync(ct);

        foreach (var user in toPurge)
        {
            var documents = await db.Documents.IgnoreQueryFilters().Where(d => d.UserId == user.Id).ToListAsync(ct);
            foreach (var doc in documents)
            {
                try { if (File.Exists(doc.StoredFilePath)) File.Delete(doc.StoredFilePath); }
                catch (Exception ex) { _logger.LogWarning(ex, "Could not delete stored file for document {DocumentId} during purge.", doc.Id); }
            }
            db.Documents.RemoveRange(documents);

            var refreshTokens = await db.RefreshTokens.IgnoreQueryFilters().Where(t => t.UserId == user.Id).ToListAsync(ct);
            db.RefreshTokens.RemoveRange(refreshTokens);

            var resetTokens = await db.PasswordResetTokens.IgnoreQueryFilters().Where(t => t.UserId == user.Id).ToListAsync(ct);
            db.PasswordResetTokens.RemoveRange(resetTokens);

            user.Email = $"deleted-{user.Id:N}@purged.datamint.local";
            user.DisplayName = null;
            user.PasswordHash = null;
            user.GoogleId = null;
            user.SecurityStamp = Guid.NewGuid().ToString("N");
            user.PurgedAtUtc = DateTime.UtcNow;

            db.AuditLogs.Add(new AuditLog
            {
                UserId = null,
                Action = "Account.Purged",
                EntityType = "User",
                EntityId = user.Id.ToString(),
                Details = $"Permanently erased after the {ApplicationUser.DeactivationGraceDays}-day deactivation grace period.",
                IsSuccess = true
            });

            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Purged deactivated account {UserId} ({DocumentCount} documents) after grace period.", user.Id, documents.Count);
        }
    }
}
