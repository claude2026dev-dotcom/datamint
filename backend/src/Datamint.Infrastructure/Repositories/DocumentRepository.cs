using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class DocumentRepository : GenericRepository<Document>, IDocumentRepository
{
    public DocumentRepository(DatamintDbContext db) : base(db) { }

    // AsSplitQuery(): two sibling collection navigations (Pages, ExtractedFields) in one query
    // otherwise produces a cartesian-join result set - purely a perf/warning fix (see the
    // EF-logged MultipleCollectionIncludeWarning), not related to the Added-vs-Modified child
    // tracking issue - see AddPage/AddExtractedField below for that.
    public Task<Document?> GetWithDetailsAsync(Guid id, CancellationToken ct = default) =>
        Set.Include(d => d.Pages).Include(d => d.ExtractedFields).Include(d => d.ExtractionTier)
           .AsSplitQuery()
           .FirstOrDefaultAsync(d => d.Id == id, ct);

    public Task<List<Document>> GetByBatchIdAsync(Guid uploadBatchId, Guid userId, CancellationToken ct = default) =>
        Set.Include(d => d.Pages).Include(d => d.ExtractedFields).Include(d => d.ExtractionTier)
           .AsSplitQuery()
           .Where(d => d.UploadBatchId == uploadBatchId && d.UserId == userId)
           .OrderBy(d => d.CreatedAtUtc)
           .ToListAsync(ct);

    public Task<List<Document>> GetByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        Set.Where(d => d.UserId == userId).OrderByDescending(d => d.CreatedAtUtc).ToListAsync(ct);

    public void AddPage(DocumentPage page) => Db.Set<DocumentPage>().Add(page);
    public void AddExtractedField(ExtractedField field) => Db.Set<ExtractedField>().Add(field);
}
