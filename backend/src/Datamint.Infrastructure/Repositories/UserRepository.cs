using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class UserRepository : GenericRepository<ApplicationUser>, IUserRepository
{
    public UserRepository(DatamintDbContext db) : base(db) { }

    public Task<ApplicationUser?> GetByEmailAsync(string email, CancellationToken ct = default) =>
        Set.FirstOrDefaultAsync(u => u.Email == email, ct);

    public Task<ApplicationUser?> GetByGoogleIdAsync(string googleId, CancellationToken ct = default) =>
        Set.FirstOrDefaultAsync(u => u.GoogleId == googleId, ct);

    public Task<ApplicationUser?> GetByEmailIncludingDeletedAsync(string email, CancellationToken ct = default) =>
        Set.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == email, ct);
}
