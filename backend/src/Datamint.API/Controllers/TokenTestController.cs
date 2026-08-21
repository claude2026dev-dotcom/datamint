using Datamint.API.Pricing;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

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
    private readonly bool _skipImagesForCleanTextPages;
    private readonly int _minReliableTextLength;

    public TokenTestController(
        IPdfTextExtractionService textExtraction, IPageImageRenderingService pageImages,
        IExtractionTierResolver tierResolver, IAiFieldExtractionServiceFactory aiFactory, ICurrentUserService currentUser,
        IConfiguration config)
    {
        _textExtraction = textExtraction;
        _pageImages = pageImages;
        _tierResolver = tierResolver;
        _aiFactory = aiFactory;
        _currentUser = currentUser;
        // Same config keys and default as DocumentProcessingService.AttachPageImagesAsync (the
        // real pipeline's source of truth for this) - duplicated here rather than shared because
        // this controller intentionally has no dependency on the Application-layer document
        // pipeline at all. Keep both in sync if the gating logic changes.
        _skipImagesForCleanTextPages = !bool.TryParse(config["Ai:SkipImagesForCleanTextPages"], out var skip) || skip;
        _minReliableTextLength = int.TryParse(config["Ai:MinPageTextLengthForSkippingImage"], out var minLength) ? minLength : 40;
    }

    private bool NeedsVisionFallback(PdfPageTextDto page) =>
        string.IsNullOrWhiteSpace(page.Text) || page.Text.Trim().Length < _minReliableTextLength;

    [HttpPost("extract")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> Extract(IFormFile? file, [FromForm] string? requestedFields, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file provided." });

        // Mirrors the real upload page's Dynamic-vs-Formatted choice: a non-empty comma-separated
        // list switches this into the same "extract ONLY these fields" mode DocumentProcessingService
        // uses for Formatted-mode/template uploads - same prompt path, same reconciliation, so the
        // token/cost numbers shown here are exactly what that mode would really cost.
        var fieldList = (requestedFields ?? "")
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .ToList();
        List<string>? requestedFieldsList = fieldList.Count > 0 ? fieldList : null;

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
                // renders and sends an image only for pages whose text layer doesn't already
                // look reliable - always attaching one would overstate real token usage now
                // that the real pipeline gates this.
                var extracted = await _textExtraction.ExtractTextAsync(tempPath, ct);
                var pageNumbers = extracted.Pages
                    .Where(p => !_skipImagesForCleanTextPages || NeedsVisionFallback(p))
                    .Select(p => p.PageNumber)
                    .ToList();
                var images = pageNumbers.Count == 0
                    ? new List<PageImageDto>()
                    : await _pageImages.RenderPagesAsync(tempPath, pageNumbers, ct);
                pages = extracted.Pages.Select(page =>
                {
                    var image = images.FirstOrDefault(i => i.PageNumber == page.PageNumber);
                    return image is null ? page : page with { ImageBytes = image.ImageBytes, ImageMediaType = image.MediaType };
                }).ToList();
            }

            var tier = await _tierResolver.ResolveForUserAsync(_currentUser.UserId!.Value, ct);
            var aiService = _aiFactory.GetService(tier.AiProvider);
            var result = await aiService.ExtractStructuredDataAsync(pages, tier, requestedFieldsList, ct);

            if (!result.Success)
                return StatusCode(502, new { success = false, message = result.ErrorMessage ?? "Extraction failed." });

            var calls = aiService.CallUsages;
            var totalInputTokens = calls.Sum(c => c.InputTokens);
            var totalOutputTokens = calls.Sum(c => c.OutputTokens);
            return Ok(new
            {
                success = true,
                mode = requestedFieldsList is null ? "Dynamic" : "Formatted",
                requestedFields = requestedFieldsList,
                fields = result.Fields,
                provider = tier.AiProvider.ToString(),
                model = tier.ModelName,
                calls = calls.Select(c => new
                {
                    purpose = c.Purpose,
                    inputTokens = c.InputTokens,
                    outputTokens = c.OutputTokens,
                    cacheCreationInputTokens = c.CacheCreationInputTokens,
                    cacheReadInputTokens = c.CacheReadInputTokens,
                    costUsd = AiModelPricing.CalculateCostUsd(tier.ModelName, c.InputTokens, c.OutputTokens)
                }),
                totalInputTokens,
                totalOutputTokens,
                totalCacheReadInputTokens = calls.Sum(c => c.CacheReadInputTokens),
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
