using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Tesseract;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// OCRs an uploaded image file directly - no PDF-page-rendering step needed, since the
/// uploaded bytes already are the bitmap Tesseract processes. Returns a synthetic single-page
/// <see cref="PdfTextExtractionResultDto"/> so it's indistinguishable, downstream, from a
/// one-page scanned PDF.
/// </summary>
public class ImageOcrExtractionService : IImageOcrExtractionService
{
    private readonly IConfiguration _config;
    private readonly ILogger<ImageOcrExtractionService> _logger;

    public ImageOcrExtractionService(IConfiguration config, ILogger<ImageOcrExtractionService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default)
    {
        var text = string.Empty;
        try
        {
            var tessDataPath = _config["Ocr:TessDataPath"] ?? "./tessdata";
            using var engine = new TesseractEngine(tessDataPath, "eng", EngineMode.Default);
            using var img = Pix.LoadFromFile(filePath);
            using var result = engine.Process(img);
            text = result.GetText();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Image OCR failed for {File}", filePath);
        }

        var page = new PdfPageTextDto(1, text, true);
        return Task.FromResult(new PdfTextExtractionResultDto(1, true, new List<PdfPageTextDto> { page }));
    }
}
