using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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

    public AuthController(IUserRepository users, IJwtTokenService jwt, IGoogleAuthService google, IAuditService audit, ICurrentUserService currentUser)
    {
        _users = users;
        _jwt = jwt;
        _google = google;
        _audit = audit;
        _currentUser = currentUser;
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

        return Ok(BuildAuthResponse(user));
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

        return Ok(BuildAuthResponse(user));
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

        return Ok(BuildAuthResponse(user));
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

    private AuthResponseDto BuildAuthResponse(ApplicationUser user)
    {
        var access = _jwt.GenerateAccessToken(user);
        var refresh = _jwt.GenerateRefreshToken();
        var profile = new UserProfileDto(user.Id, user.Email, user.DisplayName, user.Role,
            user.IsEmailVerified, user.FreeUploadsUsed, Application.Services.DocumentProcessingService.FreeUploadLimit,
            HasActiveSubscription: false); // hydrate real value once SubscriptionService is called in production

        return new AuthResponseDto(access, refresh, DateTime.UtcNow.AddMinutes(30), profile);
    }
}
