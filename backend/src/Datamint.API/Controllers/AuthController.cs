using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
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
    private readonly DatamintDbContext _db;

    // "Remember me" ticked: session survives a closed browser for this long.
    // Not ticked: a much shorter server-side ceiling, and the frontend keeps
    // the token in sessionStorage instead of localStorage, so it's gone the
    // moment the browser actually closes either way.
    private const int RememberMeDays = 10;
    private const int NotRememberedDays = 1;

    public AuthController(IUserRepository users, IJwtTokenService jwt, IGoogleAuthService google, IAuditService audit, ICurrentUserService currentUser, DatamintDbContext db)
    {
        _users = users;
        _jwt = jwt;
        _google = google;
        _audit = audit;
        _currentUser = currentUser;
        _db = db;
    }

    /// <summary>Register with email + password. Password is stored as a BCrypt hash — never in plain text.</summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequestDto dto, CancellationToken ct)
    {
        var passwordError = ValidatePasswordStrength(dto.Password);
        if (passwordError is not null)
            return BadRequest(new { success = false, message = passwordError });

        var existing = await _users.GetByEmailAsync(dto.Email, ct);
        if (existing is not null)
            return Conflict(new { success = false, message = "An account with this email already exists." });

        var user = new ApplicationUser
        {
            Email = dto.Email,
            DisplayName = dto.DisplayName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = "User"
        };

        await _users.AddAsync(user, ct);
        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.Register", user.Id, ct: ct);

        return Ok(await BuildAuthResponseAsync(user, dto.RememberMe, ct));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequestDto dto, CancellationToken ct)
    {
        var user = await _users.GetByEmailAsync(dto.Email, ct);
        if (user is null || user.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
        {
            await _audit.LogAsync("Auth.Login", null, details: $"{{\"email\":\"{dto.Email}\"}}", isSuccess: false, ct: ct);
            return Unauthorized(new { success = false, message = "Invalid email or password." });
        }

        if (!user.IsActive)
            return Unauthorized(new { success = false, message = "This account has been disabled. Contact support." });

        user.LastLoginAtUtc = DateTime.UtcNow;
        _users.Update(user);
        await _users.SaveChangesAsync(ct);
        await _audit.LogAsync("Auth.Login", user.Id, ct: ct);

        return Ok(await BuildAuthResponseAsync(user, dto.RememberMe, ct));
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

    private static ProfileDto ToProfileDto(ApplicationUser user) =>
        new(user.Id, user.Email, user.DisplayName, user.Role, user.IsEmailVerified, user.CreatedAtUtc);

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
        await _db.SaveChangesAsync(ct);

        var profile = new UserProfileDto(user.Id, user.Email, user.DisplayName, user.Role,
            user.IsEmailVerified, user.FreeUploadsUsed, Application.Services.DocumentProcessingService.FreeUploadLimit,
            HasActiveSubscription: false); // hydrate real value once SubscriptionService is called in production

        return new AuthResponseDto(access, rawRefresh, DateTime.UtcNow.AddMinutes(30), profile);
    }
}
