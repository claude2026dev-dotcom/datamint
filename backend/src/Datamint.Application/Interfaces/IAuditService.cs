namespace Datamint.Application.Interfaces;

public interface IAuditService
{
    Task LogAsync(string action, Guid? userId, string? entityType = null, string? entityId = null, string? details = null, bool isSuccess = true, CancellationToken ct = default);
}
