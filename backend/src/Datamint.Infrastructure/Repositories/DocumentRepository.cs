using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class DocumentRepository : GenericRepository<Document>, IDocumentRepository
{
    public DocumentRepository(DatamintDbContext db) : base(db) { }

    public Task<Document?> GetWithDetailsAsync(Guid id, CancellationToken ct = default) =>
        Set.Include(d => d.Pages).Include(d => d.ExtractedFields).Include(d => d.ExtractionTier)
           .FirstOrDefaultAsync(d => d.Id == id, ct);

    public Task<List<Document>> GetByBatchIdAsync(Guid uploadBatchId, Guid userId, CancellationToken ct = default) =>
        Set.Include(d => d.Pages).Include(d => d.ExtractedFields).Include(d => d.ExtractionTier)
           .Where(d => d.UploadBatchId == uploadBatchId && d.UserId == userId)
           .OrderBy(d => d.CreatedAtUtc)
           .ToListAsync(ct);
}
