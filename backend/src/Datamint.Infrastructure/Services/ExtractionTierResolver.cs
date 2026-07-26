using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Services;

public class ExtractionTierResolver : IExtractionTierResolver
{
    private readonly DatamintDbContext _db;

    public ExtractionTierResolver(DatamintDbContext db)
    {
        _db = db;
    }

    public async Task<ExtractionTier> ResolveForUserAsync(Guid userId, CancellationToken ct = default)
    {
        // A user's active subscription's plan may map to a specific tier - resolved here (not
        // in DocumentProcessingService) so every caller of extraction goes through the same
        // single source of truth for "which AI/model/prompt does this user's work right now".
        var tierFromPlan = await _db.Subscriptions
            .Where(s => s.UserId == userId && s.Status == Domain.Enums.SubscriptionStatus.Active)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => s.Plan.ExtractionTier)
            .FirstOrDefaultAsync(ct);

        if (tierFromPlan is { IsEnabled: true }) return tierFromPlan;

        return await GetDefaultAsync(ct);
    }

    public async Task<ExtractionTier> GetDefaultAsync(CancellationToken ct = default) =>
        await _db.ExtractionTiers.FirstAsync(t => t.IsDefault, ct);
}

public class AiFieldExtractionServiceFactory : IAiFieldExtractionServiceFactory
{
    private readonly ClaudeFieldExtractionService _claude;
    private readonly OpenAiFieldExtractionService _openAi;

    public AiFieldExtractionServiceFactory(ClaudeFieldExtractionService claude, OpenAiFieldExtractionService openAi)
    {
        _claude = claude;
        _openAi = openAi;
    }

    public Application.Interfaces.IAiFieldExtractionService GetService(Domain.Enums.AiProvider provider) => provider switch
    {
        Domain.Enums.AiProvider.OpenAi => _openAi,
        _ => _claude
    };
}
