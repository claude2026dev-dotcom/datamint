using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Services;

public class SessionService : ISessionService
{
    private readonly DatamintDbContext _db;

    public SessionService(DatamintDbContext db)
    {
        _db = db;
    }

    public async Task RevokeAllSessionsAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var tokens = await _db.RefreshTokens.Where(t => t.UserId == user.Id && !t.Revoked).ToListAsync(ct);
        foreach (var token in tokens) token.Revoked = true;
        user.SecurityStamp = Guid.NewGuid().ToString("N");
    }
}
