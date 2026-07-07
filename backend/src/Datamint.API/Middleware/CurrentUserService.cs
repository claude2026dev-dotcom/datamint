using System.Security.Claims;
using Datamint.Application.Interfaces;
using Microsoft.AspNetCore.Http;

namespace Datamint.API.Middleware;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _accessor;
    public CurrentUserService(IHttpContextAccessor accessor) => _accessor = accessor;

    public Guid? UserId
    {
        get
        {
            var idClaim = _accessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                          ?? _accessor.HttpContext?.User?.FindFirstValue("sub");
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    public string? Email => _accessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Email);
    public string? Role => _accessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Role);
    public bool IsAuthenticated => _accessor.HttpContext?.User?.Identity?.IsAuthenticated ?? false;
    public string? IpAddress => _accessor.HttpContext?.Connection?.RemoteIpAddress?.ToString();
}
