using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Repositories;

public class DocumentRepository : GenericRepository<Document>, IDocumentRepository
{
    public DocumentRepository(DatamintDbContext db) : base(db) { }

    public Task<List<Document>> GetByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        Set.Where(d => d.UserId == userId).OrderByDescending(d => d.CreatedAtUtc).ToListAsync(ct);

    public Task<Document?> GetWithDetailsAsync(Guid id, CancellationToken ct = default) =>
        Set.Include(d => d.Pages).Include(d => d.ExtractedFields).FirstOrDefaultAsync(d => d.Id == id, ct);

    public void AddPage(DocumentPage page) => Db.Set<DocumentPage>().Add(page);
    public void AddExtractedField(ExtractedField field) => Db.Set<ExtractedField>().Add(field);
}
