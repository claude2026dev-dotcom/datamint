using Datamint.Application.Common;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;

namespace Datamint.Application.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IAuditService _audit;
    private readonly IAuthNotificationService _notify;
    private readonly ISessionService _sessions;

    public AuthService(IUserRepository users, IAuditService audit, IAuthNotificationService notify, ISessionService sessions)
    {
        _users = users;
        _audit = audit;
        _notify = notify;
        _sessions = sessions;
    }

    public async Task<Result<ApplicationUser>> RegisterAsync(string email, string password, string? displayName, CancellationToken ct = default)
    {
        var passwordError = ValidatePasswordStrength(password);
        if (passwordError is not null)
            return Result<ApplicationUser>.Failure(passwordError, "WEAK_PASSWORD");

        var existing = await _users.GetByEmailAsync(email, ct);
        if (existing is not null)
            return Result<ApplicationUser>.Failure("An account with this email already exists.", "EMAIL_TAKEN");

        // Email stays unique at the database level even for a soft-deleted row (deletion
        // is a status flag, not a real row removal - see CLAUDE.md), so registering again
        // with a previously-deleted account's email can't create a second row: it would
        // hit that same unique index and crash. Reactivating the old row instead is also
        // the correct real-world behavior - it's the same account regaining access, not a
        // fresh one, so its subscription/free-trial history (see EnsureFreePlanActivatedAsync
        // in AuthController) correctly carries over instead of granting a new free trial
        // every time someone deletes and re-registers.
        var deletedAccount = await _users.GetByEmailIncludingDeletedAsync(email, ct);
        if (deletedAccount is not null)
        {
            deletedAccount.IsDeleted = false;
            deletedAccount.IsActive = true;
            deletedAccount.DisplayName = displayName;
            deletedAccount.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
            deletedAccount.SecurityStamp = Guid.NewGuid().ToString("N");
            await _users.SaveChangesAsync(ct);
            await _audit.LogAsync("Auth.Register", deletedAccount.Id, details: "Reactivated a previously-deleted account.", ct: ct);
            await _notify.SendWelcomeEmailAsync(deletedAccount, ct);
            return Result<ApplicationUser>.Success(deletedAccount);
        }

        var user = new ApplicationUser
        {
            Email = email,
            DisplayName = displayName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = "User"
        };

        await _users.AddAsync(user, ct);
        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.Register", user.Id, ct: ct);
        await _notify.SendWelcomeEmailAsync(user, ct);

        return Result<ApplicationUser>.Success(user);
    }

    public async Task<Result<ApplicationUser>> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var user = await _users.GetByEmailAsync(email, ct);
        if (user is null || user.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
        {
            await _audit.LogAsync("Auth.Login", null, details: $"{{\"email\":\"{email}\"}}", isSuccess: false, ct: ct);
            return Result<ApplicationUser>.Failure("Invalid email or password.", "INVALID_CREDENTIALS");
        }

        if (!user.IsActive)
            return Result<ApplicationUser>.Failure("This account has been disabled. Contact support.", "ACCOUNT_DISABLED");

        user.LastLoginAtUtc = DateTime.UtcNow;
        _users.Update(user);
        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.Login", user.Id, ct: ct);

        return Result<ApplicationUser>.Success(user);
    }

    public async Task<Result> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        if (user.PasswordHash is null)
            return Result.Failure("This account signs in with Google and has no password to change.", "GOOGLE_ONLY_ACCOUNT");

        if (!BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
            return Result.Failure("Your current password is incorrect.", "WRONG_PASSWORD");

        var passwordError = ValidatePasswordStrength(newPassword);
        if (passwordError is not null)
            return Result.Failure(passwordError, "WEAK_PASSWORD");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        await _sessions.RevokeAllSessionsAsync(user, ct);
        await _users.SaveChangesAsync(ct);

        await _audit.LogAsync("Auth.PasswordChanged", user.Id, ct: ct);
        await _notify.SendPasswordChangedEmailAsync(user, ct);

        return Result.Success();
    }

    public async Task<Result> DeleteAccountAsync(ApplicationUser user, string? currentPassword, CancellationToken ct = default)
    {
        if (user.IsSuperAdmin)
            return Result.Failure("The super admin account can't be deleted.", "SUPER_ADMIN_PROTECTED");

        if (user.PasswordHash is not null)
        {
            if (string.IsNullOrEmpty(currentPassword) || !BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
                return Result.Failure("Your current password is incorrect.", "WRONG_PASSWORD");
        }

        var email = user.Email;
        var displayName = user.DisplayName;

        user.IsActive = false;
        user.IsDeleted = true;
        await _sessions.RevokeAllSessionsAsync(user, ct);
        await _users.SaveChangesAsync(ct);

        await _audit.LogAsync("Auth.AccountDeleted", user.Id, ct: ct);
        await _notify.SendAccountDeletedEmailAsync(email, displayName, ct);

        return Result.Success();
    }

    /// <summary>
    /// Server-side enforcement (never trust client-only validation): 8+ chars,
    /// at least one uppercase, one lowercase, one digit, one special character.
    /// </summary>
    private static string? ValidatePasswordStrength(string password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 8)
            return "Password must be at least 8 characters long.";
        if (!password.Any(char.IsUpper))
            return "Password must include at least one uppercase letter.";
        if (!password.Any(char.IsLower))
            return "Password must include at least one lowercase letter.";
        if (!password.Any(char.IsDigit))
            return "Password must include at least one number.";
        if (!password.Any(c => !char.IsLetterOrDigit(c)))
            return "Password must include at least one special character.";
        return null;
    }
}
