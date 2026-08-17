using Datamint.Application.Interfaces;
using Datamint.Application.Services;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Consumes documents queued by DocumentsController.Upload and runs the actual AI extraction off
/// the HTTP request thread - see DocumentProcessingService.ProcessDocumentAsync's own doc comment
/// for why. Quota charging and batch field-key harmonization - both previously done in the
/// controller right after the whole (synchronous) upload finished - move here too, since "the
/// whole batch finished" is now only something the worker can observe.
///
/// Documents are processed strictly one at a time (a single consumer loop, no parallel dequeue):
/// deliberate, not just simple - it keeps AI-provider call volume predictable on a free-tier plan
/// and means the batch-harmonization check below never has to worry about two documents in the
/// same batch finishing concurrently.
/// </summary>
public class DocumentProcessingBackgroundService : BackgroundService
{
    private readonly IBackgroundJobQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DocumentProcessingBackgroundService> _logger;

    public DocumentProcessingBackgroundService(IBackgroundJobQueue queue, IServiceScopeFactory scopeFactory, ILogger<DocumentProcessingBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Anything left at Uploaded/Processing by a previous process (a redeploy or restart
        // while it was queued or actively extracting) has no queued work item anymore - this
        // in-process queue doesn't survive a restart. Without this sweep those rows would sit
        // orphaned forever with no way for their owner to ever learn what happened.
        await FailOrphanedDocumentsAsync(stoppingToken);

        await foreach (var item in _queue.DequeueAllAsync(stoppingToken))
        {
            try
            {
                await ProcessAsync(item);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled failure processing queued document {DocumentId}", item.DocumentId);
            }
        }
    }

    private async Task FailOrphanedDocumentsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();

        var orphaned = await db.Documents
            .Where(d => d.Status == DocumentStatus.Uploaded || d.Status == DocumentStatus.Processing)
            .ToListAsync(ct);

        if (orphaned.Count == 0) return;

        foreach (var doc in orphaned)
        {
            doc.Status = DocumentStatus.Failed;
            doc.FailureReason = "Processing was interrupted by a server restart. Please try uploading this document again.";
        }

        await db.SaveChangesAsync(ct);
        _logger.LogWarning("Marked {Count} orphaned document(s) as Failed on startup.", orphaned.Count);
    }

    /// <summary>
    /// Deliberately CancellationToken.None below, not the worker's own stoppingToken: once a
    /// document's extraction is underway it should run to completion (or its own natural
    /// failure inside ProcessDocumentAsync) even if the app starts shutting down mid-item - an
    /// aborted, half-charged extraction is worse than a slightly delayed shutdown.
    /// </summary>
    private async Task ProcessAsync(DocumentProcessingWorkItem item)
    {
        using var scope = _scopeFactory.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<DocumentProcessingService>();
        var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();

        var result = await service.ProcessDocumentAsync(item.DocumentId, item.SelectedPageNumbers, item.PreExtractedText, CancellationToken.None);
        if (!result.Succeeded) return;

        var doc = result.Data!;
        if (doc.Status != nameof(DocumentStatus.Failed))
            await ChargeQuotaAsync(doc.Id, doc.PageCount, db);

        // Formatted mode never needs harmonization (see HarmonizeBatchFieldKeysAsync's own doc
        // comment) - skip the batch-completion check entirely rather than let it run a no-op query.
        if (!item.IsFormattedMode)
            await TryHarmonizeIfBatchCompleteAsync(item.UploadBatchId, service, db);
    }

    /// <summary>Only a successfully-extracted document counts against quota - the same rule
    /// DocumentsController used to apply after the whole (synchronous) batch finished.</summary>
    private static async Task ChargeQuotaAsync(Guid documentId, int pageCount, DatamintDbContext db)
    {
        var document = await db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == documentId);
        if (document is null) return;

        var subscription = await db.Subscriptions
            .Where(s => s.UserId == document.UserId
                && (s.Status == SubscriptionStatus.Active || (s.Status == SubscriptionStatus.Cancelled && s.EndAtUtc > DateTime.UtcNow)))
            .OrderByDescending(s => s.StartAtUtc)
            .FirstOrDefaultAsync();
        if (subscription is null) return;

        subscription.PagesUsedThisCycle += pageCount;
        await db.SaveChangesAsync();
    }

    /// <summary>Runs field-key harmonization once every document sharing this batch id has
    /// reached a terminal status. Since documents are processed strictly one at a time (see
    /// class comment), only the worker iteration that finishes a batch's LAST remaining document
    /// ever finds every sibling already terminal - every earlier iteration for the same batch is
    /// a no-op here.</summary>
    private static async Task TryHarmonizeIfBatchCompleteAsync(Guid uploadBatchId, DocumentProcessingService service, DatamintDbContext db)
    {
        var batchDocs = await db.Documents.AsNoTracking()
            .Where(d => d.UploadBatchId == uploadBatchId)
            .Select(d => new { d.Id, d.Status })
            .ToListAsync();

        if (batchDocs.Count < 2) return;
        if (batchDocs.Any(d => d.Status is DocumentStatus.Uploaded or DocumentStatus.Processing)) return;

        await service.HarmonizeBatchFieldKeysAsync(batchDocs.Select(d => d.Id).ToList());
    }
}
