using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Every account lifecycle email (register, password reset/changed, disabled/enabled,
/// deleted) goes through here instead of being composed ad-hoc in controllers, so the
/// templates and copy stay in one place and stay consistent.
/// </summary>
public interface IAuthNotificationService
{
    Task SendWelcomeEmailAsync(ApplicationUser user, CancellationToken ct = default);
    /// <summary>rawToken is the un-hashed token; this builds the full reset link itself so callers never need to know the frontend's URL shape.</summary>
    Task SendPasswordResetEmailAsync(ApplicationUser user, string rawToken, bool triggeredByAdmin, CancellationToken ct = default);
    Task SendPasswordChangedEmailAsync(ApplicationUser user, CancellationToken ct = default);
    Task SendAccountStatusChangedEmailAsync(ApplicationUser user, bool isActive, CancellationToken ct = default);
    Task SendAccountDeletedEmailAsync(string toAddress, string? displayName, CancellationToken ct = default);
}
