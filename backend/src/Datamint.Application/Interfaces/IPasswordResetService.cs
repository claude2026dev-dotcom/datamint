using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Owns the password-reset token lifecycle so AuthController (user-initiated) and
/// AdminController (admin-triggered) share one implementation instead of duplicating
/// token generation/validation logic.
/// </summary>
public interface IPasswordResetService
{
    /// <summary>Invalidates any earlier unused tokens for this user, then issues a new one. Returns the raw (un-hashed) token to email to the user.</summary>
    Task<string> CreateResetTokenAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Returns the matching user and marks the token used if it's valid, unused, and unexpired; otherwise null.</summary>
    Task<ApplicationUser?> ValidateAndConsumeAsync(string rawToken, CancellationToken ct = default);
}
