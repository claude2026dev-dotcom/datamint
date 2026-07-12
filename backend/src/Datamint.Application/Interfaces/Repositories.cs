using Datamint.Domain.Entities;

namespace Datamint.Application.Interfaces;

/// <summary>Minimal generic repository — kept intentionally small; complex queries live in dedicated repos below.</summary>
public interface IGenericRepository<T> where T : BaseEntity
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<T>> GetAllAsync(CancellationToken ct = default);
    Task AddAsync(T entity, CancellationToken ct = default);
    void Update(T entity);
    void SoftDelete(T entity);
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

public interface IUserRepository : IGenericRepository<ApplicationUser>
{
    Task<ApplicationUser?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<ApplicationUser?> GetByGoogleIdAsync(string googleId, CancellationToken ct = default);
    /// <summary>Includes soft-deleted rows - used only to decide whether a new registration
    /// should reactivate a previously-deleted account instead of colliding with the
    /// database's unconditional unique index on Email (which a soft-deleted row still holds).</summary>
    Task<ApplicationUser?> GetByEmailIncludingDeletedAsync(string email, CancellationToken ct = default);
}

public interface IDocumentRepository : IGenericRepository<Document>
{
    Task<List<Document>> GetByUserIdAsync(Guid userId, CancellationToken ct = default);
    Task<Document?> GetWithDetailsAsync(Guid id, CancellationToken ct = default);
    void AddPage(DocumentPage page);
    void AddExtractedField(ExtractedField field);
}
