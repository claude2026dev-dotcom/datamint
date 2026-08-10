using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Resolves which ExtractionTier (AI provider/model/prompt customization) applies to a given
/// user's extraction, entirely invisibly to that user. Resolution order: (1) an admin-configured
/// override for the user's Role (see RoleExtractionTierOverride - e.g. every "Admin" account
/// pinned to a specific tier regardless of plan), (2) the user's active subscription's Plan-
/// mapped tier, (3) the one tier flagged IsDefault, which always exists and can't be deleted.
/// </summary>
public interface IExtractionTierResolver
{
    Task<ExtractionTier> ResolveForUserAsync(Guid userId, CancellationToken ct = default);
    Task<ExtractionTier> GetDefaultAsync(CancellationToken ct = default);
}

/// <summary>Picks the right concrete IAiFieldExtractionService for a tier's AiProvider - lets
/// both Claude and OpenAI implementations be registered side by side (rather than one being
/// bound to the shared interface via static config), since which provider is used is now a
/// per-document decision, not an app-wide one.</summary>
public interface IAiFieldExtractionServiceFactory
{
    IAiFieldExtractionService GetService(Domain.Enums.AiProvider provider);
}
