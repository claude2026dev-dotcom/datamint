namespace Datamint.Application.Interfaces;

/// <summary>Wraps HttpContext user claims so services never depend on ASP.NET Core directly.</summary>
public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Email { get; }
    string? Role { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
}
