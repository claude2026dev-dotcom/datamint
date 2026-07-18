using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Reads a PDF (with automatic OCR fallback for scanned/image-only pages) into
/// plain page text. Provider-agnostic — the AI that turns this text into
/// structured fields is a separate concern (see IAiFieldExtractionService),
/// so swapping AI providers never touches PDF/OCR code and vice versa.
/// </summary>
public interface IPdfTextExtractionService
{
    Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default);
}

/// <summary>
/// OCRs a directly-uploaded image file (JPEG/PNG/WebP/BMP - a photo or scan, not a PDF) straight
/// into the same <see cref="PdfTextExtractionResultDto"/> shape PDF extraction produces (a
/// synthetic single page, UsedOcr always true) so every downstream consumer - the AI extraction
/// prompt, export, DocumentPage persistence - needs zero changes to handle an image "document."
/// Unlike the PDF OCR path, this never needs page-rendering: the uploaded bytes already are the
/// bitmap Tesseract needs.
/// </summary>
public interface IImageOcrExtractionService
{
    Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default);

    /// <summary>
    /// The uploaded bytes already are the image the AI should see - no rasterization needed,
    /// unlike a PDF page. Converts BMP to PNG (Claude/OpenAI vision don't accept BMP) via the
    /// already-referenced SixLabors.ImageSharp; passes JPEG/PNG/WebP through untouched.
    /// </summary>
    Task<PageImageDto> GetSourceImageAsync(string filePath, CancellationToken ct = default);
}

/// <param name="OcrText">Only populated for a page whose PdfPig text came back empty (a scanned
/// page) - real OCR run against this same rendered bitmap, reusing the render instead of
/// rasterizing the page a second time. Null for pages that already had real text.</param>
public record PageImageDto(int PageNumber, byte[] ImageBytes, string MediaType, string? OcrText = null);

/// <summary>
/// Renders PDF pages to raster images for AI vision input - deliberately NOT part of
/// <see cref="IPdfTextExtractionService"/>, which stays a fast, text-only, count-only path used
/// by the upload quota-gating pre-check and the `/peek` page-picker endpoint (both run before
/// page-selection is known and would otherwise pay to rasterize pages that get discarded).
/// Called only from <c>DocumentProcessingService.ProcessDocumentAsync</c>, after page-selection
/// has already filtered down to the pages actually going to the AI.
/// </summary>
public interface IPageImageRenderingService
{
    /// <param name="pageNumbers">The already page-selection-filtered set actually going to the AI.</param>
    /// <param name="pagesNeedingOcr">The subset whose PdfPig text came back empty (scanned pages) -
    /// OCR only runs for those, against the image already rendered for the AI call, rather than
    /// rasterizing a second time.</param>
    Task<List<PageImageDto>> RenderPagesAsync(string filePath, IReadOnlyList<int> pageNumbers,
        IReadOnlySet<int> pagesNeedingOcr, CancellationToken ct = default);
}

/// <summary>
/// Turns extracted page text into structured key/value fields using an AI model.
/// Implemented once per provider (Claude, OpenAI, ...); which one is active is a
/// config switch ("AiProvider:Provider" in appsettings) resolved in Program.cs —
/// nothing else in the app needs to know which provider is in use.
/// </summary>
public interface IAiFieldExtractionService
{
    /// <param name="requestedFields">
    /// Null/empty = dynamic mode (AI decides which fields exist). Non-empty = formatted
    /// mode: extract ONLY these exact fields, in this order, null value if not found.
    /// </param>
    Task<AiExtractionResultDto> ExtractStructuredDataAsync(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default);

    /// <summary>
    /// Each document in a bulk upload is extracted independently, so the exact same
    /// real-world field (e.g. an invoice number) can come back worded differently per
    /// document ("Invoice Number" vs "Invoice No" vs "Inv #"). Given every distinct field
    /// label seen across a batch, this asks the AI to recognize which labels mean the same
    /// thing and returns one canonical name per group - every input label maps to a value,
    /// including labels that are already fine as-is (which map to themselves). Returns an
    /// empty dictionary (not an exception) on any failure, so a harmonization hiccup never
    /// blocks the upload it was only meant to polish.
    /// </summary>
    Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, CancellationToken ct = default);
}
