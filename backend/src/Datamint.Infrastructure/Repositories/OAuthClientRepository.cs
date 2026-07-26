using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class OAuthClientRepository : GenericRepository<OAuthClient>, IOAuthClientRepository
{
    public OAuthClientRepository(DatamintDbContext db) : base(db) { }

    public Task<OAuthClient?> GetByClientIdAsync(string clientId, CancellationToken ct = default) =>
        Set.Include(c => c.RedirectUris).Include(c => c.Scopes)
           .FirstOrDefaultAsync(c => c.ClientId == clientId, ct);
}
