namespace Datamint.Application.DTOs;

public record RegisterRequestDto(string Email, string Password, string? DisplayName, bool RememberMe = true);
public record LoginRequestDto(string Email, string Password, bool RememberMe = false);
public record GoogleLoginRequestDto(string IdToken);
public record RefreshTokenRequestDto(string RefreshToken);

public record AuthResponseDto(
    string AccessToken,
    string RefreshToken,
    DateTime AccessTokenExpiresAtUtc,
    UserProfileDto User);

public record RefreshResponseDto(string AccessToken, string RefreshToken, DateTime AccessTokenExpiresAtUtc);

public record UserProfileDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string Role,
    bool IsEmailVerified,
    int FreeUploadsUsed,
    int FreeUploadLimit,
    bool HasActiveSubscription);

public record GoogleUserInfoDto(string GoogleId, string Email, string? Name, bool EmailVerified);

public record ProfileDto(Guid Id, string Email, string? DisplayName, string Role, bool IsEmailVerified, DateTime CreatedAtUtc, bool HasPassword);

public record UpdateProfileRequestDto(string? DisplayName);

public record ForgotPasswordRequestDto(string Email);
public record ResetPasswordRequestDto(string Token, string NewPassword);
public record ChangePasswordRequestDto(string CurrentPassword, string NewPassword);

/// <summary>Null CurrentPassword is only valid for Google-only accounts, which have no password to verify.</summary>
public record DeleteAccountRequestDto(string? CurrentPassword);
