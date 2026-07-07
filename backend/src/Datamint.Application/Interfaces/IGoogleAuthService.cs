using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

public interface IGoogleAuthService
{
    /// <summary>Validates the Google ID token sent by the Angular frontend and returns the user's Google profile.</summary>
    Task<GoogleUserInfoDto> ValidateIdTokenAsync(string idToken, CancellationToken ct = default);
}
