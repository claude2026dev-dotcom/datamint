using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Google.Apis.Auth;
using Microsoft.Extensions.Configuration;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Validates the Google Identity Services ID token sent from the Angular
/// frontend against Google's public keys.
/// >>> Set "GoogleAuth:ClientId" (OAuth 2.0 Web Client ID from Google Cloud
///     Console) in appsettings. The frontend needs the SAME client id. <<<
/// </summary>
public class GoogleAuthService : IGoogleAuthService
{
    private readonly IConfiguration _config;

    public GoogleAuthService(IConfiguration config) => _config = config;

    public async Task<GoogleUserInfoDto> ValidateIdTokenAsync(string idToken, CancellationToken ct = default)
    {
        var clientId = _config["GoogleAuth:ClientId"];
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = new[] { clientId }
        };

        var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
        return new GoogleUserInfoDto(payload.Subject, payload.Email, payload.Name, payload.EmailVerified);
    }
}
