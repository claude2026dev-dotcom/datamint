using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>Everything DocumentProcessingService.ProcessDocumentAsync needs, captured at upload
/// time so the queue never has to re-derive it (e.g. re-parsing the PDF a second time) once
/// dequeued by the background worker.</summary>
public record DocumentProcessingWorkItem(
    Guid DocumentId,
    IReadOnlyList<int>? SelectedPageNumbers,
    PdfTextExtractionResultDto PreExtractedText,
    Guid UploadBatchId,
    bool IsFormattedMode);

/// <summary>
/// Decouples document upload from document processing so the upload HTTP request can return
/// immediately instead of running AI extraction inline - see DocumentProcessingService.
/// ProcessDocumentAsync's own doc comment for why (a large/dense multi-page batch's total
/// extraction time can otherwise exceed the platform's own request timeout, orphaning the
/// document with no way for the client to ever learn what happened).
///
/// A single in-process queue is enough for this app's single-instance deployment - nothing here
/// needs cross-instance durability, and the consuming background service sweeps for anything
/// left mid-flight by a previous process on startup.
/// </summary>
public interface IBackgroundJobQueue
{
    void QueueDocumentProcessing(DocumentProcessingWorkItem item);
    IAsyncEnumerable<DocumentProcessingWorkItem> DequeueAllAsync(CancellationToken ct);
}
