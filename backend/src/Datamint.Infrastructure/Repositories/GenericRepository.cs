using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class GenericRepository<T> : IGenericRepository<T> where T : BaseEntity
{
    protected readonly DatamintDbContext Db;
    protected readonly DbSet<T> Set;

    public GenericRepository(DatamintDbContext db)
    {
        Db = db;
        Set = db.Set<T>();
    }

    public Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default) => Set.FirstOrDefaultAsync(e => e.Id == id, ct);
    public Task<List<T>> GetAllAsync(CancellationToken ct = default) => Set.ToListAsync(ct);
    public async Task AddAsync(T entity, CancellationToken ct = default) => await Set.AddAsync(entity, ct);
    public void Update(T entity) => Set.Update(entity);
    public void SoftDelete(T entity) { entity.IsDeleted = true; Set.Update(entity); }
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => Db.SaveChangesAsync(ct);
}
