using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;

namespace Datamint.Infrastructure.Services;

public class AuditService : IAuditService
{
    private readonly DatamintDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public AuditService(DatamintDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task LogAsync(string action, Guid? userId, string? entityType = null, string? entityId = null, string? details = null, bool isSuccess = true, CancellationToken ct = default)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            Action = action,
            UserId = userId,
            EntityType = entityType,
            EntityId = entityId,
            Details = details,
            IsSuccess = isSuccess,
            IpAddress = _currentUser.IpAddress
        });
        await _db.SaveChangesAsync(ct);
    }
}
