using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PDFtoImage;
using SkiaSharp;
using Tesseract;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Renders PDF pages to raster images for AI vision input - see IPageImageRenderingService for
/// why this is deliberately separate from IPdfTextExtractionService (peek/quota-gating must never
/// pay to rasterize pages that page-selection later discards). Only called from
/// DocumentProcessingService.ProcessDocumentAsync, on the already page-selection-filtered set.
/// Annotations and filled AcroForm fields are rendered directly onto the image (WithAnnotations/
/// WithFormFill) so the AI sees the document exactly as a person opening it would - including the
/// filled-in values the annotation-recovery text fix (see PdfTextExtractionService) already
/// surfaces separately as text, now visually reinforced in the image too.
/// </summary>
public class PdfPageImageRenderingService : IPageImageRenderingService
{
    private readonly IConfiguration _config;
    private readonly ILogger<PdfPageImageRenderingService> _logger;

    public PdfPageImageRenderingService(IConfiguration config, ILogger<PdfPageImageRenderingService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<List<PageImageDto>> RenderPagesAsync(string filePath, IReadOnlyList<int> pageNumbers,
        IReadOnlySet<int> pagesNeedingOcr, CancellationToken ct = default)
    {
        var maxDimension = int.TryParse(_config["Ai:PageImageMaxDimensionPx"], out var configuredMax) ? configuredMax : 1568;
        var results = new List<PageImageDto>();
        var pdfBytes = File.ReadAllBytes(filePath);

        foreach (var pageNumber in pageNumbers)
        {
            ct.ThrowIfCancellationRequested();
            // One bad page must never fail the whole document - same defensive pattern as
            // PdfTextExtractionService's annotation/form-field reading.
            try
            {
                Index pageIndex = pageNumber - 1;
                using var sizeStream = new MemoryStream(pdfBytes);
                var pageSize = Conversion.GetPageSize(sizeStream, pageIndex);
                var options = pageSize.Width >= pageSize.Height
                    ? new RenderOptions(Width: maxDimension, WithAspectRatio: true, WithAnnotations: true, WithFormFill: true)
                    : new RenderOptions(Height: maxDimension, WithAspectRatio: true, WithAnnotations: true, WithFormFill: true);

                using var renderStream = new MemoryStream(pdfBytes);
                using var bitmap = Conversion.ToImage(renderStream, pageIndex, options: options);
                using var encoded = bitmap.Encode(SKEncodedImageFormat.Png, 90);
                var pngBytes = encoded.ToArray();

                var ocrText = pagesNeedingOcr.Contains(pageNumber) ? RunOcr(pngBytes, pageNumber) : null;

                results.Add(new PageImageDto(pageNumber, pngBytes, "image/png", ocrText));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not render page {Page} of {File} to an image; continuing without it.", pageNumber, filePath);
            }
        }

        return Task.FromResult(results);
    }

    /// <summary>
    /// Runs against the same rendered PNG bytes already produced for the AI-vision image, instead
    /// of rasterizing the page a second time - this is what finally makes OCR real (previously a
    /// dead stub in PdfTextExtractionService.RunOcrOnPage that always returned an empty string).
    /// </summary>
    private string? RunOcr(byte[] pngBytes, int pageNumber)
    {
        try
        {
            var tessDataPath = _config["Ocr:TessDataPath"] ?? "./tessdata";
            using var engine = new TesseractEngine(tessDataPath, "eng", EngineMode.Default);
            using var img = Pix.LoadFromMemory(pngBytes);
            using var result = engine.Process(img);
            return result.GetText();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OCR failed for rendered page {Page}; continuing with empty text for this page.", pageNumber);
            return null;
        }
    }
}
