using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

public interface IJwtTokenService
{
    string GenerateAccessToken(ApplicationUser user);
    string GenerateRefreshToken();
}
