using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Tesseract;
using UglyToad.PdfPig;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Reads a PDF's text layer with PdfPig; any page with no usable text is
/// treated as scanned/image-only and is OCR'd with Tesseract instead. This is
/// AI-provider-agnostic — it only produces plain page text, which is then handed
/// to whichever IAiFieldExtractionService is configured (Claude, OpenAI, ...).
/// </summary>
public class PdfTextExtractionService : IPdfTextExtractionService
{
    private readonly IConfiguration _config;
    private readonly ILogger<PdfTextExtractionService> _logger;

    public PdfTextExtractionService(IConfiguration config, ILogger<PdfTextExtractionService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default)
    {
        var pages = new List<PdfPageTextDto>();
        bool anyOcrUsed = false;

        using var document = PdfDocument.Open(filePath);
        int pageNumber = 0;

        foreach (var page in document.GetPages())
        {
            pageNumber++;
            var text = page.Text;

            if (string.IsNullOrWhiteSpace(text))
            {
                // No text layer -> this page is a scan/image. Fall back to OCR.
                text = RunOcrOnPage(filePath, pageNumber);
                anyOcrUsed = true;
                pages.Add(new PdfPageTextDto(pageNumber, text, true));
            }
            else
            {
                pages.Add(new PdfPageTextDto(pageNumber, text, false));
            }
        }

        return Task.FromResult(new PdfTextExtractionResultDto(pageNumber, anyOcrUsed, pages));
    }

    /// <summary>
    /// Renders the given page to an image and runs Tesseract OCR on it.
    /// Requires the "tessdata" folder (eng.traineddata) to be deployed
    /// alongside the app — see README for setup.
    /// </summary>
    private string RunOcrOnPage(string filePath, int pageNumber)
    {
        try
        {
            var tessDataPath = _config["Ocr:TessDataPath"] ?? "./tessdata";
            // NOTE: rendering the PDF page to a bitmap is handled via PdfiumViewer
            // in the real implementation (kept out of this scaffold to avoid a
            // native-library dependency at build time). Wire this up as:
            //   1. Render page -> PNG bytes (PdfiumViewer / Pdfium)
            //   2. Feed PNG bytes into Tesseract below
            using var engine = new TesseractEngine(tessDataPath, "eng", EngineMode.Default);
            // Placeholder: replace `imageBytes` with the actual rendered page image.
            byte[] imageBytes = Array.Empty<byte>();
            if (imageBytes.Length == 0)
            {
                _logger.LogWarning("OCR rendering step not wired up yet for page {Page} of {File}. See README > OCR setup.", pageNumber, filePath);
                return string.Empty;
            }
            using var img = Pix.LoadFromMemory(imageBytes);
            using var result = engine.Process(img);
            return result.GetText();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OCR failed for page {Page} of {File}", pageNumber, filePath);
            return string.Empty;
        }
    }
}
