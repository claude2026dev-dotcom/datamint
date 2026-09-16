using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Reads a PDF into plain page text (PdfPig, text-layer only - no OCR). Provider-agnostic:
/// the AI that turns this text into structured fields is a separate concern (see
/// IAiFieldExtractionService), so swapping AI providers never touches PDF code and vice versa.
/// </summary>
public interface IPdfTextExtractionService
{
    Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default);
}

/// <param name="ImageBytes">A rendered raster image of this PDF page, for AI vision input.</param>
public record PageImageDto(int PageNumber, byte[] ImageBytes, string MediaType);

/// <summary>
/// Renders PDF pages to raster images for AI vision input - deliberately NOT part of
/// IPdfTextExtractionService, which stays a fast, text-only, count-only path used by the
/// upload quota-gating pre-check and the /peek page-picker endpoint (both run before
/// page-selection is known and would otherwise pay to rasterize pages that get discarded).
/// Called only from DocumentProcessingService.ProcessDocumentAsync, after page-selection has
/// already filtered down to the pages actually going to the AI.
/// </summary>
public interface IPageImageRenderingService
{
    /// <param name="pageNumbers">The already page-selection-filtered set actually going to the AI.</param>
    Task<List<PageImageDto>> RenderPagesAsync(string filePath, IReadOnlyList<int> pageNumbers, CancellationToken ct = default);
}

/// <summary>
/// Turns extracted page text (plus, when available, page images) into structured key/value
/// fields using an AI model. Implemented once per provider (Claude, OpenAI); which provider,
/// model, and prompt customization is used for a given call is resolved per-document from its
/// ExtractionTier (see IExtractionTierResolver) - nothing else in the app needs to know which
/// provider is actually doing the work.
/// </summary>
public interface IAiFieldExtractionService
{
    /// <param name="requestedFields">
    /// Null/empty = dynamic mode (AI decides which fields exist). Non-empty = formatted
    /// mode: extract ONLY these exact fields, in this order, null value if not found.
    /// </param>
    Task<AiExtractionResultDto> ExtractStructuredDataAsync(
        IEnumerable<PdfPageTextDto> pages,
        Domain.Entities.ExtractionTier tier,
        IReadOnlyList<string>? requestedFields = null,
        CancellationToken ct = default);

    /// <summary>Every real call (FirstPass/Verify/Harmonization) made by this instance so far -
    /// each provider is resolved fresh per request (see AiFieldExtractionServiceFactory), so this
    /// naturally covers exactly one document's (or one batch's) extraction. Purely additive
    /// instrumentation for the token-usage sample app; the real product never reads this.</summary>
    IReadOnlyList<AiCallUsage> CallUsages { get; }

    /// <summary>
    /// Each document in a bulk upload is extracted independently, so the exact same real-world
    /// field (e.g. an invoice number) can come back worded differently per document ("Invoice
    /// Number" vs "Invoice No" vs "Inv #"). Given every distinct field label seen across a
    /// batch, this asks the AI to recognize which labels mean the same thing and returns one
    /// canonical name per group - every input label maps to a value, including labels that are
    /// already fine as-is (which map to themselves). Returns an empty dictionary (not an
    /// exception) on any failure, so a harmonization hiccup never blocks the upload it was only
    /// meant to polish.
    /// </summary>
    Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, Domain.Entities.ExtractionTier tier, CancellationToken ct = default);
}

public interface IExcelExportService
{
    ExportResultDto ExportSingle(string fileName, List<Domain.Entities.ExtractedField> fields, ExportLayout layout, List<Guid>? includedFieldIds);
    ExportResultDto ExportBatchSingleSheet(List<(string FileName, List<Domain.Entities.ExtractedField> Fields)> documents, ExportLayout layout);
    ExportResultDto ExportBatchMultipleSheets(List<(string FileName, List<Domain.Entities.ExtractedField> Fields)> documents, ExportLayout layout);
    ExportResultDto ExportBatchSeparateFiles(List<(string FileName, List<Domain.Entities.ExtractedField> Fields)> documents, ExportLayout layout);
}

public interface IJsonExportService
{
    ExportResultDto ExportSingle(string fileName, List<Domain.Entities.ExtractedField> fields, List<Guid>? includedFieldIds);
    ExportResultDto ExportBatch(List<(string FileName, List<Domain.Entities.ExtractedField> Fields)> documents);
}
