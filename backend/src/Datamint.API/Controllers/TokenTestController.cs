using Datamint.API.Pricing;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Datamint.API.Controllers;

/// <summary>
/// Backs the standalone token-usage sample app - the same JWT auth, same ExtractionTier
/// resolution, and same IAiFieldExtractionService.ExtractStructuredDataAsync call the real
/// upload pipeline uses (see DocumentProcessingService.ProcessDocumentAsync), so the token counts
/// shown here are exactly what a real upload by this user would cost - first-pass call (with page
/// images, same as a real PDF/image upload), verify call, and any empty-result retry of that pair.
/// Deliberately bypasses Document/DocumentPage persistence and Plan/quota charging - this exists
/// to observe cost, not to produce a real document record.
/// </summary>
[ApiController]
[Route("api/token-test")]
[Authorize]
public class TokenTestController : ControllerBase
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".pdf", ".jpg", ".jpeg", ".png", ".webp" };

    private readonly IPdfTextExtractionService _textExtraction;
    private readonly IPageImageRenderingService _pageImages;
    private readonly IExtractionTierResolver _tierResolver;
    private readonly IAiFieldExtractionServiceFactory _aiFactory;
    private readonly ICurrentUserService _currentUser;

    public TokenTestController(
        IPdfTextExtractionService textExtraction, IPageImageRenderingService pageImages,
        IExtractionTierResolver tierResolver, IAiFieldExtractionServiceFactory aiFactory, ICurrentUserService currentUser)
    {
        _textExtraction = textExtraction;
        _pageImages = pageImages;
        _tierResolver = tierResolver;
        _aiFactory = aiFactory;
        _currentUser = currentUser;
    }

    [HttpPost("extract")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> Extract(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file provided." });

        var ext = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(ext))
            return BadRequest(new { success = false, message = "Only PDF, JPG, PNG, or WEBP files are supported." });

        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-tokentest-{Guid.NewGuid()}{ext}");
        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.Create))
                await file.CopyToAsync(stream, ct);

            var isImage = !ext.Equals(".pdf", StringComparison.OrdinalIgnoreCase);
            List<PdfPageTextDto> pages;
            if (isImage)
            {
                var bytes = await System.IO.File.ReadAllBytesAsync(tempPath, ct);
                var mediaType = ext.ToLowerInvariant() switch
                {
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".png" => "image/png",
                    ".webp" => "image/webp",
                    _ => "image/jpeg"
                };
                pages = new List<PdfPageTextDto> { new(1, "", bytes, mediaType) };
            }
            else
            {
                // Mirrors DocumentProcessingService.AttachPageImagesAsync: a real PDF upload
                // sends both the extracted text AND a rendered image of each page to the
                // first-pass call, not text alone - skipping this would understate real token
                // usage for the (by far more common) PDF-upload case.
                var extracted = await _textExtraction.ExtractTextAsync(tempPath, ct);
                var pageNumbers = extracted.Pages.Select(p => p.PageNumber).ToList();
                var images = await _pageImages.RenderPagesAsync(tempPath, pageNumbers, ct);
                pages = extracted.Pages.Select(page =>
                {
                    var image = images.FirstOrDefault(i => i.PageNumber == page.PageNumber);
                    return image is null ? page : page with { ImageBytes = image.ImageBytes, ImageMediaType = image.MediaType };
                }).ToList();
            }

            var tier = await _tierResolver.ResolveForUserAsync(_currentUser.UserId!.Value, ct);
            var aiService = _aiFactory.GetService(tier.AiProvider);
            var result = await aiService.ExtractStructuredDataAsync(pages, tier, requestedFields: null, ct);

            if (!result.Success)
                return StatusCode(502, new { success = false, message = result.ErrorMessage ?? "Extraction failed." });

            var calls = aiService.CallUsages;
            var totalInputTokens = calls.Sum(c => c.InputTokens);
            var totalOutputTokens = calls.Sum(c => c.OutputTokens);
            return Ok(new
            {
                success = true,
                fields = result.Fields,
                provider = tier.AiProvider.ToString(),
                model = tier.ModelName,
                calls = calls.Select(c => new
                {
                    purpose = c.Purpose,
                    inputTokens = c.InputTokens,
                    outputTokens = c.OutputTokens,
                    costUsd = AiModelPricing.CalculateCostUsd(tier.ModelName, c.InputTokens, c.OutputTokens)
                }),
                totalInputTokens,
                totalOutputTokens,
                totalCostUsd = AiModelPricing.CalculateCostUsd(tier.ModelName, totalInputTokens, totalOutputTokens),
                pricingKnown = AiModelPricing.GetRates(tier.ModelName) is not null
            });
        }
        finally
        {
            if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
        }
    }
}
