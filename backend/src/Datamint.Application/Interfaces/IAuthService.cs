using Datamint.Application.Common;
using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Identity business rules (validation, credential checks, account-state transitions and
/// their side effects - session revocation, audit logging, notification emails) live here,
/// not in AuthController, per this project's "no business logic in controllers" rule.
/// Token issuance/shaping the HTTP response stays in the controller, same as the existing
/// /refresh endpoint - this only owns the decisions and the entity mutations behind them.
/// </summary>
public interface IAuthService
{
    Task<Result<ApplicationUser>> RegisterAsync(string email, string password, string? displayName, CancellationToken ct = default);
    Task<Result<ApplicationUser>> LoginAsync(string email, string password, CancellationToken ct = default);
    Task<Result> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword, CancellationToken ct = default);
    Task<Result> DeleteAccountAsync(ApplicationUser user, string? currentPassword, CancellationToken ct = default);
}
