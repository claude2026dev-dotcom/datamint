using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly IJwtTokenService _jwt;
    private readonly IGoogleAuthService _google;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuthNotificationService _notify;
    private readonly IPasswordResetService _passwordReset;
    private readonly ISessionService _sessions;
    private readonly IAuthService _authService;
    private readonly DatamintDbContext _db;

    // "Remember me" ticked: refresh token (and therefore the session) survives
    // for this long. Not ticked: a much shorter ceiling, so an un-remembered
    // session naturally requires signing in again well within a day.
    private const int RememberMeDays = 10;
    private const int NotRememberedDays = 1;

    public AuthController(IUserRepository users, IJwtTokenService jwt, IGoogleAuthService google, IAuditService audit, ICurrentUserService currentUser, IAuthNotificationService notify, IPasswordResetService passwordReset, ISessionService sessions, IAuthService authService, DatamintDbContext db)
    {
        _users = users;
        _jwt = jwt;
        _google = google;
        _audit = audit;
        _currentUser = currentUser;
        _notify = notify;
        _passwordReset = passwordReset;
        _sessions = sessions;
        _authService = authService;
        _db = db;
    }

    /// <summary>Register with email + password. Password is stored as a BCrypt hash — never in plain text.</summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequestDto dto, CancellationToken ct)
    {
        var result = await _authService.RegisterAsync(dto.Email, dto.Password, dto.DisplayName, ct);
        if (!result.Succeeded) return AuthError(result.ErrorCode!, result.Error!);

        return Ok(await BuildAuthResponseAsync(result.Data!, dto.RememberMe, ct));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequestDto dto, CancellationToken ct)
    {
        var result = await _authService.LoginAsync(dto.Email, dto.Password, ct);
        if (!result.Succeeded) return AuthError(result.ErrorCode!, result.Error!);

        return Ok(await BuildAuthResponseAsync(result.Data!, dto.RememberMe, ct));
    }

    /// <summary>Frontend uses Google Identity Services to get an ID token, then posts it here.</summary>
    [HttpPost("google")]
    public async Task<IActionResult> GoogleLogin(GoogleLoginRequestDto dto, CancellationToken ct)
    {
        var googleUser = await _google.ValidateIdTokenAsync(dto.IdToken, ct);

        var user = await _users.GetByGoogleIdAsync(googleUser.GoogleId, ct)
                   ?? await _users.GetByEmailAsync(googleUser.Email, ct);

        if (user is null)
        {
            // A soft-deleted account's row is still in the table (deletion is a status
            // flag, not a real row removal), and Email/GoogleId both stay unique at the
            // DB level even for it - so blindly inserting a new row here for someone who
            // previously deleted their Google-linked account hits that same unique index
            // and throws, which is exactly the "why won't it let me back in" bug this
            // guards against. Reactivate that row instead, mirroring what
            // AuthService.RegisterAsync already does for the password sign-up path.
            var deletedAccount = await _users.GetByEmailIncludingDeletedAsync(googleUser.Email, ct);
            if (deletedAccount is not null)
            {
                deletedAccount.IsDeleted = false;
                deletedAccount.IsActive = true;
                deletedAccount.GoogleId ??= googleUser.GoogleId;
                deletedAccount.IsEmailVerified = googleUser.EmailVerified;
                deletedAccount.SecurityStamp = Guid.NewGuid().ToString("N");
                deletedAccount.LastLoginAtUtc = DateTime.UtcNow;
                user = deletedAccount;
                await _audit.LogAsync("Auth.GoogleLogin", user.Id, details: "Reactivated a previously-deleted account.", ct: ct);
            }
            else
            {
                // New entity: only AddAsync it. Calling Update() on it afterward would
                // force its EF Core tracking state from Added to Modified, making
                // SaveChangesAsync emit an UPDATE for a row that doesn't exist yet
                // (0 rows affected -> DbUpdateConcurrencyException).
                user = new ApplicationUser
                {
                    Email = googleUser.Email,
                    DisplayName = googleUser.Name,
                    GoogleId = googleUser.GoogleId,
                    IsEmailVerified = googleUser.EmailVerified,
                    Role = "User",
                    LastLoginAtUtc = DateTime.UtcNow
                };
                await _users.AddAsync(user, ct);
            }
        }
        else
        {
            if (user.GoogleId is null)
                user.GoogleId = googleUser.GoogleId; // link existing email/password account to Google

            user.LastLoginAtUtc = DateTime.UtcNow;
            _users.Update(user);
        }

        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.GoogleLogin", user.Id, ct: ct);

        // No "remember me" checkbox in the Google flow - a Google sign-in is
        // always treated as a "remember me" session.
        return Ok(await BuildAuthResponseAsync(user, rememberMe: true, ct));
    }

    /// <summary>
    /// Exchanges a still-valid refresh token for a new access token, rotating
    /// the refresh token in the same call: the old one is revoked immediately,
    /// so if it's ever replayed later (e.g. it leaked) it's already dead.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshTokenRequestDto dto, CancellationToken ct)
    {
        var tokenHash = _jwt.HashToken(dto.RefreshToken);
        var stored = await _db.RefreshTokens.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == tokenHash, ct);

        if (stored is null || stored.Revoked || stored.ExpiresAtUtc < DateTime.UtcNow)
            return Unauthorized(new { success = false, message = "Your session has expired. Please sign in again.", errorCode = "REFRESH_INVALID" });

        // A refresh token minted before an admin disabled/deleted this account (or before
        // a password change) must not be able to mint a fresh access token afterward - the
        // access-token-side check (OnTokenValidated) only catches tokens already issued.
        if (stored.User.IsDeleted || !stored.User.IsActive)
        {
            stored.Revoked = true;
            await _db.SaveChangesAsync(ct);
            return Unauthorized(new { success = false, message = "Your session has expired. Please sign in again.", errorCode = "REFRESH_INVALID" });
        }

        stored.Revoked = true;

        var remainingLifetime = stored.ExpiresAtUtc - DateTime.UtcNow;
        var newRawToken = _jwt.GenerateRefreshToken();
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = stored.UserId,
            Token = _jwt.HashToken(newRawToken),
            ExpiresAtUtc = DateTime.UtcNow.Add(remainingLifetime > TimeSpan.Zero ? remainingLifetime : TimeSpan.FromDays(NotRememberedDays))
        });
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.TokenRefreshed", stored.UserId, ct: ct);

        var access = _jwt.GenerateAccessToken(stored.User);
        return Ok(new RefreshResponseDto(access, newRawToken, DateTime.UtcNow.AddMinutes(30)));
    }

    /// <summary>Server-side revocation: the refresh token is dead from this point on, not just forgotten client-side.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshTokenRequestDto dto, CancellationToken ct)
    {
        var tokenHash = _jwt.HashToken(dto.RefreshToken);
        var stored = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.Token == tokenHash, ct);
        if (stored is not null)
        {
            stored.Revoked = true;
            await _db.SaveChangesAsync(ct);
        }

        await _audit.LogAsync("Auth.Logout", _currentUser.UserId, ct: ct);
        return Ok(new { success = true });
    }

    /// <summary>
    /// Always returns a generic success message, whether or not the email exists or is
    /// Google-only — telling the caller which is true would let an attacker enumerate
    /// registered accounts. The actual email is only sent when there's a real, resettable
    /// account behind it.
    /// </summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequestDto dto, CancellationToken ct)
    {
        var user = await _users.GetByEmailAsync(dto.Email, ct);
        if (user is not null && user.IsActive && user.PasswordHash is not null)
        {
            var rawToken = await _passwordReset.CreateResetTokenAsync(user.Id, ct);
            await _audit.LogAsync("Auth.PasswordResetRequested", user.Id, ct: ct);
            await _notify.SendPasswordResetEmailAsync(user, rawToken, triggeredByAdmin: false, ct);
        }

        return Ok(new { success = true, message = "If an account exists for that email, we've sent a password reset link." });
    }

    /// <summary>Completes a reset started by /forgot-password (or an admin-triggered one) — the token is single-use and short-lived.</summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequestDto dto, CancellationToken ct)
    {
        var passwordError = ValidatePasswordStrength(dto.NewPassword);
        if (passwordError is not null)
            return BadRequest(new { success = false, message = passwordError });

        var user = await _passwordReset.ValidateAndConsumeAsync(dto.Token, ct);
        if (user is null)
            return BadRequest(new { success = false, message = "This password reset link is invalid or has expired. Please request a new one." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        await _sessions.RevokeAllSessionsAsync(user, ct);
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("Auth.PasswordReset", user.Id, ct: ct);
        await _notify.SendPasswordChangedEmailAsync(user, ct);

        return Ok(new { success = true, message = "Your password has been reset. Please sign in with your new password." });
    }

    /// <summary>Current user's minimal profile — email, display name, role, join date.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(_currentUser.UserId!.Value, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        return Ok(new { success = true, profile = ToProfileDto(user) });
    }

    /// <summary>Edit the minimal profile info a user can change themselves — just the display name for now.</summary>
    [HttpPut("me")]
    [Authorize]
    public async Task<IActionResult> UpdateMe(UpdateProfileRequestDto dto, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(_currentUser.UserId!.Value, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        user.DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? null : dto.DisplayName.Trim();
        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.ProfileUpdated", user.Id, ct: ct);

        return Ok(new { success = true, profile = ToProfileDto(user) });
    }

    /// <summary>Self-service password change from the profile page. Signs the user out everywhere as a precaution.</summary>
    [HttpPut("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequestDto dto, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(_currentUser.UserId!.Value, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        var result = await _authService.ChangePasswordAsync(user, dto.CurrentPassword, dto.NewPassword, ct);
        if (!result.Succeeded) return AuthError(result.ErrorCode!, result.Error!);

        return Ok(new { success = true, message = "Your password has been changed. Please sign in again." });
    }

    /// <summary>
    /// Self-service account deletion. Email/password accounts must confirm their current
    /// password first — the same bar as changing a password — since this is irreversible.
    /// Google-only accounts have no password to check.
    /// </summary>
    [HttpDelete("me")]
    [Authorize]
    public async Task<IActionResult> DeleteMe(DeleteAccountRequestDto dto, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(_currentUser.UserId!.Value, ct);
        if (user is null) return NotFound(new { success = false, message = "User not found." });

        var result = await _authService.DeleteAccountAsync(user, dto.CurrentPassword, ct);
        if (!result.Succeeded) return AuthError(result.ErrorCode!, result.Error!);

        await CancelActiveSubscriptionsAsync(user.Id, ct);

        return Ok(new { success = true, message = "Your account has been deactivated." });
    }

    /// <summary>
    /// Deactivating stops billing immediately rather than letting a subscription ride
    /// out its current period or sit frozen for reactivation - an account the user
    /// believes is gone should never keep getting charged in the background.
    /// </summary>
    internal static async Task CancelActiveSubscriptionsAsync(DatamintDbContext db, Guid userId, CancellationToken ct)
    {
        var activeSubs = await db.Subscriptions
            .Where(s => s.UserId == userId && (s.Status == SubscriptionStatus.Active || s.Status == SubscriptionStatus.PastDue))
            .ToListAsync(ct);

        if (activeSubs.Count == 0) return;

        var now = DateTime.UtcNow;
        foreach (var sub in activeSubs)
        {
            sub.Status = SubscriptionStatus.Cancelled;
            sub.EndAtUtc = now;
        }
        await db.SaveChangesAsync(ct);
    }

    private Task CancelActiveSubscriptionsAsync(Guid userId, CancellationToken ct) => CancelActiveSubscriptionsAsync(_db, userId, ct);

    private static ProfileDto ToProfileDto(ApplicationUser user) =>
        new(user.Id, user.Email, user.DisplayName, user.Role, user.IsEmailVerified, user.CreatedAtUtc, user.PasswordHash is not null, user.IsSuperAdmin);

    /// <summary>Maps an IAuthService failure's error code to the HTTP status the frontend already expects.</summary>
    private IActionResult AuthError(string errorCode, string message) => errorCode switch
    {
        "EMAIL_TAKEN" => Conflict(new { success = false, message }),
        "INVALID_CREDENTIALS" or "ACCOUNT_DISABLED" => Unauthorized(new { success = false, message }),
        _ => BadRequest(new { success = false, message }), // WEAK_PASSWORD, WRONG_PASSWORD, GOOGLE_ONLY_ACCOUNT
    };

    /// <summary>Server-side enforcement (never trust client-only validation): 8+ chars,
    /// at least one uppercase, one lowercase, one digit, one special character. Also
    /// used by /reset-password, which doesn't go through IAuthService.</summary>
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

    private async Task<AuthResponseDto> BuildAuthResponseAsync(ApplicationUser user, bool rememberMe, CancellationToken ct)
    {
        var access = _jwt.GenerateAccessToken(user);
        var rawRefresh = _jwt.GenerateRefreshToken();

        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = _jwt.HashToken(rawRefresh),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(rememberMe ? RememberMeDays : NotRememberedDays)
        });

        var hasActiveSubscription = await EnsureFreePlanActivatedAsync(user.Id, ct);
        await _db.SaveChangesAsync(ct);

        var profile = new UserProfileDto(user.Id, user.Email, user.DisplayName, user.Role,
            user.IsEmailVerified, hasActiveSubscription, user.IsSuperAdmin);

        return new AuthResponseDto(access, rawRefresh, DateTime.UtcNow.AddMinutes(30), profile);
    }

    /// <summary>
    /// Every account should have at least the Free plan active the moment they sign in -
    /// no separate "activate free plan" click required. Returns whether the user now has
    /// (or already had) an active subscription of any kind. Doesn't call SaveChangesAsync
    /// itself - the caller (BuildAuthResponseAsync) saves once for the whole login/register flow.
    /// </summary>
    private async Task<bool> EnsureFreePlanActivatedAsync(Guid userId, CancellationToken ct)
    {
        // A cancelled-but-not-yet-ended subscription is still usable, not just Status == Active -
        // checking Active alone here would silently create a duplicate Free subscription
        // every time a user with a still-in-grace-period cancellation logs back in.
        var hasUsable = await _db.Subscriptions.AnyAsync(s => s.UserId == userId
            && (s.Status == SubscriptionStatus.Active || (s.Status == SubscriptionStatus.Cancelled && s.EndAtUtc > DateTime.UtcNow)), ct);
        if (hasUsable) return true;

        // The Free plan is a one-time lifetime allowance (Plan.IsRecurring = false), not a monthly
        // grant - so it's only auto-activated the first time this UserId has EVER had a subscription
        // of any kind. Without this, deleting and re-registering the same email (which reactivates
        // the same account row - see AuthService.RegisterAsync) would otherwise hand out a fresh
        // free trial every time, since the account currently has no *usable* subscription above.
        var everHadAny = await _db.Subscriptions.AnyAsync(s => s.UserId == userId, ct);
        if (everHadAny) return false;

        var freePlan = await _db.Plans.FirstOrDefaultAsync(p => p.IsFreeTrial && p.IsActive, ct);
        if (freePlan is null) return false; // no free trial plan configured - nothing to auto-activate

        var startAt = DateTime.UtcNow;
        _db.Subscriptions.Add(new Subscription
        {
            UserId = userId,
            PlanId = freePlan.Id,
            Status = SubscriptionStatus.Active,
            StartAtUtc = startAt,
            EndAtUtc = freePlan.ComputeSubscriptionEndAt(startAt)
        });
        await _audit.LogAsync("Subscription.Activated", userId, ct: ct, details: "Free plan auto-activated on sign-in.");
        return true;
    }
}
