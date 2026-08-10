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

public interface IOAuthClientRepository : IGenericRepository<OAuthClient>
{
    /// <summary>Always includes RedirectUris and Scopes - every caller (protocol logic, admin
    /// CRUD) ends up needing both, so this stays one method rather than forcing every call site
    /// to remember which .Include() chain it needs.</summary>
    Task<OAuthClient?> GetByClientIdAsync(string clientId, CancellationToken ct = default);
}

public interface IDocumentRepository : IGenericRepository<Document>
{
    /// <summary>Always includes Pages, ExtractedFields, and ExtractionTier - every caller
    /// (processing, review, export) ends up needing the full graph, so this stays one method
    /// rather than forcing every call site to remember which .Include() chain it needs.</summary>
    Task<Document?> GetWithDetailsAsync(Guid id, CancellationToken ct = default);

    /// <summary>Every document sharing the given batch id, owned by the given user - powers
    /// both the batch-review page and batch export/email.</summary>
    Task<List<Document>> GetByBatchIdAsync(Guid uploadBatchId, Guid userId, CancellationToken ct = default);

    /// <summary>Every document a user has ever uploaded, newest first - powers the Documents
    /// history page.</summary>
    Task<List<Document>> GetByUserIdAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Adds a child row directly via its own DbSet, rather than through
    /// `document.Pages.Add(...)`/`document.ExtractedFields.Add(...)` on an already-tracked
    /// parent - the latter was observed to leave the new child tracked as Modified instead of
    /// Added in this app (root-caused once before - see DocumentProcessingService.
    /// ProcessDocumentAsync's comment), causing a 0-rows-affected DbUpdateConcurrencyException.
    /// Adding via the DbSet directly always unambiguously marks the entity Added; the FK
    /// (DocumentId, already set on the entity before calling this) wires it to the parent.</summary>
    void AddPage(DocumentPage page);
    void AddExtractedField(ExtractedField field);
}
