using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

public interface IJwtTokenService
{
    string GenerateAccessToken(ApplicationUser user);
    string GenerateRefreshToken();

    /// <summary>Refresh tokens are stored hashed, never raw - same principle as a password.</summary>
    string HashToken(string token);

    /// <summary>Mints an OAuth2 access token - same signing key/issuer/audience as
    /// GenerateAccessToken, but a different claim set: "client_id" and "scope" always present;
    /// "sub" and "security_stamp" present only for a user-delegated (authorization_code) token
    /// and absent for a client_credentials token, which has no user behind it. The stamp claim
    /// matters as much here as it does for a regular login token - without it, an OAuth token
    /// minted for a user wouldn't be killed by that user's next password change. Program.cs's
    /// OnTokenValidated branches on whether "sub" is present to decide which live checks to
    /// run.</summary>
    string GenerateOAuthAccessToken(string clientId, ApplicationUser? user, string scope, int lifetimeMinutes);
}
