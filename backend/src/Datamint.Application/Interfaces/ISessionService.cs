using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Kills every session a user has, everywhere: revokes every refresh token (so no new
/// access token can be minted) and rotates the security stamp (so every access token
/// already issued fails its per-request validity check immediately, instead of quietly
/// working until its own ~30 min expiry). Used any time a user's credentials or standing
/// change from under them - self password change/reset, account deletion, and admin
/// disabling/deleting an account - so the effect is identical no matter who triggered it
/// or which browser/device the old session is sitting in.
/// </summary>
public interface ISessionService
{
    Task RevokeAllSessionsAsync(ApplicationUser user, CancellationToken ct = default);
}
