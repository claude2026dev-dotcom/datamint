using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Datamint.API.Controllers;

/// <summary>
/// Backs the standalone token-usage sample app - the same JWT auth as the rest of the API, but a
/// single, un-persisted Claude call bypassing Document/Plan/quota entirely, so it can be exercised
/// by any logged-in user purely to observe real input/output token counts for a real extraction.
/// </summary>
[ApiController]
[Route("api/token-test")]
[Authorize]
public class TokenTestController : ControllerBase
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".pdf", ".jpg", ".jpeg", ".png", ".webp" };

    private readonly IPdfTextExtractionService _textExtraction;
    private readonly ITokenUsageExtractionService _tokenService;

    public TokenTestController(IPdfTextExtractionService textExtraction, ITokenUsageExtractionService tokenService)
    {
        _textExtraction = textExtraction;
        _tokenService = tokenService;
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

            List<PdfPageTextDto> pages;
            var isImage = !ext.Equals(".pdf", StringComparison.OrdinalIgnoreCase);
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
                var extracted = await _textExtraction.ExtractTextAsync(tempPath, ct);
                pages = extracted.Pages;
            }

            var result = await _tokenService.ExtractWithUsageAsync(pages, ct);
            if (!result.Success)
                return StatusCode(502, new { success = false, message = result.ErrorMessage ?? "Extraction failed." });

            return Ok(new
            {
                success = true,
                resultJson = result.ResultJson,
                inputTokens = result.InputTokens,
                outputTokens = result.OutputTokens,
                model = result.Model
            });
        }
        finally
        {
            if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
        }
    }
}
