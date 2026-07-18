using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
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

    public Task<PageImageDto> GetSourceImageAsync(string filePath, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();

        // Claude/OpenAI vision APIs don't accept BMP - decode and re-encode as PNG. Every other
        // accepted upload type (JPEG/PNG/WebP) passes through untouched, no wasted re-encoding.
        if (ext == ".bmp")
        {
            using var image = Image.Load(filePath);
            using var ms = new MemoryStream();
            image.SaveAsPng(ms);
            return Task.FromResult(new PageImageDto(1, ms.ToArray(), "image/png"));
        }

        var mediaType = ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "image/png"
        };
        return Task.FromResult(new PageImageDto(1, File.ReadAllBytes(filePath), mediaType));
    }
}
