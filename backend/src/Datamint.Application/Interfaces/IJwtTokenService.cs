using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

public interface IJwtTokenService
{
    string GenerateAccessToken(ApplicationUser user);
    string GenerateRefreshToken();

    /// <summary>Refresh tokens are stored hashed, never raw - same principle as a password.</summary>
    string HashToken(string token);
}
