using System.Text.Json;
using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Application.Services;
using Datamint.API.Filters;
using Datamint.Domain.Enums;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Datamint.API.Controllers;

[ApiController]
[Route("api/documents")]
public class DocumentsController : ControllerBase
{
    private readonly DocumentProcessingService _service;
    private readonly IDocumentRepository _documents;
    private readonly IUserRepository _users;
    private readonly ICurrentUserService _currentUser;
    private readonly IConfiguration _config;
    private readonly DatamintDbContext _db;

    private static readonly HashSet<string> AllowedUploadExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp" };

    public DocumentsController(
        DocumentProcessingService service, IDocumentRepository documents, IUserRepository users,
        ICurrentUserService currentUser, IConfiguration config, DatamintDbContext db)
    {
        _service = service;
        _documents = documents;
        _users = users;
        _currentUser = currentUser;
        _config = config;
        _db = db;
    }

    /// <summary>
    /// Uploads one or more PDFs. Requires sign-in - quota is enforced purely against the
    /// caller's own chosen Plan/subscription, never a client-supplied counter or anything
    /// tracked before they have an account.
    /// </summary>
    [HttpPost("upload")]
    [EnforcesUploadLimit]
    [RequestSizeLimit(30_000_000)]
    public async Task<IActionResult> Upload(
        [FromForm] List<IFormFile> files,
        [FromForm] string? extractionMode = "Dynamic",
        [FromForm] string? requestedFields = null,
        [FromForm] string? pageSelections = null,
        CancellationToken ct = default)
    {
        var userId = _currentUser.UserId;
        if (userId is null)
            return StatusCode(401, new { success = false, message = "Please sign in to upload and extract documents.", errorCode = "LOGIN_REQUIRED" });

        if (files is null || files.Count == 0)
            return BadRequest(new { success = false, message = "Please select at least one PDF file to upload." });

        var isFormatted = string.Equals(extractionMode, "Formatted", StringComparison.OrdinalIgnoreCase);
        if (isFormatted && string.IsNullOrWhiteSpace(requestedFields))
            return BadRequest(new { success = false, message = "List the field names to extract, separated by commas, or switch to Dynamic mode." });

        // A cancelled plan still works until its paid-for period ends - only Status ==
        // Active plans that have actually lapsed (past EndAtUtc, never renewed) are excluded.
        var subscription = await _db.Subscriptions
            .Include(s => s.Plan)
            .Where(s => s.UserId == userId
                && (s.Status == SubscriptionStatus.Active || (s.Status == SubscriptionStatus.Cancelled && s.EndAtUtc > DateTime.UtcNow)))
            .OrderByDescending(s => s.StartAtUtc)
            .FirstOrDefaultAsync(ct);

        var hasUnlimitedPlan = subscription?.Plan.MonthlyPageLimit == -1;
        var overLimit = subscription is null
            || (!hasUnlimitedPlan && subscription.PagesUsedThisCycle >= subscription.Plan.MonthlyPageLimit);

        if (overLimit)
        {
            return StatusCode(402, new
            {
                success = false,
                message = subscription is null
                    ? "Please choose a plan to start extracting data."
                    : subscription.Plan.IsRecurring
                        ? "You've used all the pages in your current billing cycle. Please upgrade to continue."
                        : "You've used up your plan's page allowance. Please upgrade to continue.",
                errorCode = "PLAN_LIMIT_REACHED",
                redirectTo = "/plans"
            });
        }

        foreach (var file in files)
        {
            if (!AllowedUploadExtensions.Contains(Path.GetExtension(file.FileName)))
                return BadRequest(new { success = false, message = $"'{file.FileName}' isn't a supported file type. Upload a PDF or an image (JPG/PNG/WEBP/BMP)." });
        }

        List<PageSelectionDto>? selections = null;
        if (!string.IsNullOrWhiteSpace(pageSelections))
        {
            try { selections = JsonSerializer.Deserialize<List<PageSelectionDto>>(pageSelections, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }
            catch (JsonException) { return BadRequest(new { success = false, message = "Invalid page selection data." }); }
        }

        // Every document created below shares this id, marking them as one upload batch -
        // lets the frontend's "My documents" list show a multi-file upload as one grouped
        // entry (linking to the combined batch review) instead of as separate rows.
        var uploadBatchId = Guid.NewGuid();

        var uploadsRoot = _config["FileStorage:UploadsRootPath"] ?? "./uploads";
        Directory.CreateDirectory(uploadsRoot);

        var saved = new List<(IFormFile File, string StoredPath)>();
        foreach (var file in files)
        {
            var storedPath = Path.Combine(uploadsRoot, $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}");
            await using (var stream = new FileStream(storedPath, FileMode.Create))
                await file.CopyToAsync(stream, ct);
            saved.Add((file, storedPath));
        }

        // Every file's page count has to be known BEFORE any AI extraction runs, so the
        // whole batch can be gated against remaining quota up front instead of letting it
        // all through and only charging (i.e. discovering the overage) afterwards. This
        // read-only pass is the same one ProcessDocumentAsync would otherwise redo, so its
        // result is carried forward below instead of re-extracting each file twice. Applying
        // any page selection here - BEFORE the quota gate below - is what makes the gate
        // charge only for the pages the caller actually chose to extract, not the whole file.
        var textResults = new List<PdfTextExtractionResultDto>();
        for (var i = 0; i < saved.Count; i++)
        {
            var full = await _service.ExtractTextAsync(saved[i].StoredPath, saved[i].File.FileName, ct);
            var spec = selections?.FirstOrDefault(s => s.FileIndex == i)?.Pages;
            textResults.Add(ApplyPageSelection(full, spec));
        }

        var totalPages = textResults.Sum(r => r.PageCount);
        if (!hasUnlimitedPlan && totalPages > subscription!.Plan.MonthlyPageLimit - subscription.PagesUsedThisCycle)
        {
            foreach (var (_, storedPath) in saved)
            {
                if (System.IO.File.Exists(storedPath)) System.IO.File.Delete(storedPath);
            }

            var remaining = subscription.Plan.MonthlyPageLimit - subscription.PagesUsedThisCycle;
            return StatusCode(402, new
            {
                success = false,
                message = $"This upload has {totalPages} page(s) in total, but your plan only has {remaining} page(s) remaining. Remove some files or upgrade your plan.",
                errorCode = "PLAN_LIMIT_REACHED",
                redirectTo = "/plans"
            });
        }

        var results = new List<DocumentSummaryDto>();
        for (var i = 0; i < saved.Count; i++)
        {
            var (file, storedPath) = saved[i];
            var result = await _service.UploadAndQueueAsync(
                userId.Value, file.FileName, storedPath, file.Length, _currentUser.IpAddress,
                isFormatted ? "Formatted" : "Dynamic", isFormatted ? requestedFields : null, uploadBatchId, ct);
            if (!result.Succeeded)
                return BadRequest(new { success = false, message = result.Error });

            // NOTE: for a smooth "animated processing" UX on the frontend, kick this
            // off via a background job/queue (e.g. Hangfire or a hosted service) and
            // let the frontend poll GET /api/documents/{id} for status. Calling it
            // inline here for scaffold simplicity.
            // Deliberately CancellationToken.None, not `ct`: this OCR + AI call can
            // legitimately take many seconds, and a dropped client connection (page
            // reload, network blip, tab close) must not abort processing that's
            // already underway - the document should still finish extracting even
            // if this particular response never reaches the browser.
            var processed = await _service.ProcessDocumentAsync(result.Data!.Id, textResults[i], CancellationToken.None);
            // Add the POST-processing summary (Status reflects whether extraction actually
            // succeeded), not the pre-processing one - otherwise a failed extraction still
            // looks like "Uploaded" to the frontend with no explanation of what went wrong.
            results.Add(processed.Succeeded ? processed.Data! : result.Data!);
        }

        // Only meaningful for an actual multi-file batch - reconciles field labels across
        // the documents that just extracted (e.g. "Invoice No" vs "Invoice Number") so the
        // combined batch view/export puts matching fields in the same column. Runs before
        // the response goes out so the frontend's very next detail fetch already sees the
        // harmonized names, not a stale pre-harmonization set it'd have to re-fetch to see.
        if (results.Count > 1)
            await _service.HarmonizeBatchFieldKeysAsync(results.Select(d => d.Id).ToList(), CancellationToken.None);

        if (subscription is not null)
        {
            // Charged in actual extracted pages - a failed extraction (PageCount still
            // reported since text extraction succeeded even if the AI call failed) still
            // counts, since the quota gate above already confirmed the whole batch fits.
            subscription.PagesUsedThisCycle += results.Sum(d => d.PageCount);
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new { success = true, documents = results });
    }

    /// <summary>Filters a full extraction result down to a caller-chosen page subset - absent/empty
    /// spec means "all pages," so the common no-selection path returns the input unchanged.</summary>
    private static PdfTextExtractionResultDto ApplyPageSelection(PdfTextExtractionResultDto full, string? pagesSpec)
    {
        if (string.IsNullOrWhiteSpace(pagesSpec)) return full;

        var selectedPageNumbers = PageRangeParser.Parse(pagesSpec, full.PageCount).ToHashSet();
        var filteredPages = full.Pages.Where(p => selectedPageNumbers.Contains(p.PageNumber)).ToList();
        return new PdfTextExtractionResultDto(filteredPages.Count, filteredPages.Any(p => p.UsedOcr), filteredPages);
    }

    /// <summary>
    /// Lightweight pre-upload check: returns each file's page count (and whether it'll need OCR)
    /// without touching quota or saving anything permanent - lets the frontend offer a page-range
    /// picker before the real upload commits to it. Re-extracts the same file a second time at
    /// actual upload (acceptable - decoupled by design, cheap relative to the AI call).
    /// </summary>
    [HttpPost("peek")]
    public async Task<IActionResult> Peek([FromForm] List<IFormFile> files, CancellationToken ct)
    {
        if (_currentUser.UserId is null)
            return StatusCode(401, new { success = false, message = "Please sign in to upload and extract documents.", errorCode = "LOGIN_REQUIRED" });

        if (files is null || files.Count == 0)
            return BadRequest(new { success = false, message = "Please select at least one file." });

        foreach (var file in files)
        {
            if (!AllowedUploadExtensions.Contains(Path.GetExtension(file.FileName)))
                return BadRequest(new { success = false, message = $"'{file.FileName}' isn't a supported file type. Upload a PDF or an image (JPG/PNG/WEBP/BMP)." });
        }

        var results = new List<PeekFileResultDto>();
        foreach (var file in files)
        {
            var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-peek-{Guid.NewGuid()}{Path.GetExtension(file.FileName)}");
            try
            {
                await using (var stream = new FileStream(tempPath, FileMode.Create))
                    await file.CopyToAsync(stream, ct);

                var extracted = await _service.ExtractTextAsync(tempPath, file.FileName, ct);
                results.Add(new PeekFileResultDto(file.FileName, extracted.PageCount, extracted.RequiredOcr));
            }
            finally
            {
                if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
            }
        }

        return Ok(new PeekResultDto(results));
    }

    /// <summary>
    /// A document can only ever be viewed by its owner. If someone else's shared link ends up
    /// on your screen, we deliberately don't distinguish "not yours" from "doesn't exist": an
    /// unauthenticated visitor is asked to sign in, while a different logged-in user gets the
    /// same 404 as a genuinely missing document, so a shared URL never confirms someone else's
    /// document even exists.
    /// </summary>
    private async Task<(Domain.Entities.Document? document, IActionResult? error)> GetOwnedDocumentAsync(Guid id, CancellationToken ct)
    {
        var document = await _documents.GetWithDetailsAsync(id, ct);
        if (document is null) return (null, NotFound(new { success = false, message = "Document not found." }));

        // Note: null-safe on purpose, not a plain `!=` - null != null is false in C#, which would
        // let an unauthenticated visitor view any document with no owner as if it were "theirs".
        // Uploads always require sign-in now, so document.UserId should never be null for a
        // document created going forward; this only matters for pre-existing legacy rows.
        var isOwner = document.UserId is not null && document.UserId == _currentUser.UserId;
        if (!isOwner)
        {
            if (_currentUser.UserId is null)
                return (null, StatusCode(401, new { success = false, message = "Please sign in to view your extracted data.", errorCode = "LOGIN_REQUIRED" }));

            return (null, NotFound(new { success = false, message = "Document not found." }));
        }

        return (document, null);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetDetail(Guid id, CancellationToken ct)
    {
        var (document, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        return Ok(new
        {
            success = true,
            document!.Id,
            document.OriginalFileName,
            document.PageCount,
            document.RequiresOcr,
            Status = document.Status.ToString(),
            document.ExtractionMode,
            document.RequestedFields,
            Fields = document.ExtractedFields.OrderBy(f => f.SortOrder).Select(f => new
            {
                f.Id,
                f.FieldKey,
                f.OriginalFieldKey,
                f.FieldValue,
                f.PageNumber,
                f.WasEditedByUser,
                // Pre-existing rows extracted before these columns existed are null - fall back
                // to "Generic"/"General" here so the frontend always gets a concrete grouping.
                SemanticType = string.IsNullOrWhiteSpace(f.SemanticType) ? "Generic" : f.SemanticType,
                SectionLabel = string.IsNullOrWhiteSpace(f.SectionLabel) ? "General" : f.SectionLabel,
                f.IncludeInExport,
                f.SortOrder
            })
        });
    }

    [HttpPut("{id:guid}/fields")]
    public async Task<IActionResult> UpdateField(Guid id, UpdateFieldRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.UpdateFieldAsync(id, dto.FieldId, dto.NewValue, dto.NewKey, dto.IncludeInExport, ct);
        return result.Succeeded ? Ok(new { success = true, field = result.Data }) : NotFound(new { success = false, message = result.Error });
    }

    [HttpPut("{id:guid}/fields/reorder")]
    public async Task<IActionResult> ReorderFields(Guid id, ReorderFieldsRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.ReorderFieldsAsync(id, dto.Fields, ct);
        return result.Succeeded ? Ok(new { success = true }) : NotFound(new { success = false, message = result.Error });
    }

    [HttpPut("{id:guid}/sections/rename")]
    public async Task<IActionResult> RenameSection(Guid id, RenameSectionRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.RenameSectionAsync(id, dto.OldLabel, dto.NewLabel, ct);
        return result.Succeeded ? Ok(new { success = true }) : BadRequest(new { success = false, message = result.Error });
    }

    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id, [FromQuery] string format = "Excel", [FromQuery] string layout = "RowsPerField", CancellationToken ct = default)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var options = new ExportOptionsDto(
            Enum.TryParse<ExportFormat>(format, true, out var f) ? f : ExportFormat.Excel,
            Enum.TryParse<ExportLayout>(layout, true, out var l) ? l : ExportLayout.RowsPerField);

        var result = await _service.ExportDocumentAsync(id, options, ct);
        if (!result.Succeeded) return NotFound(new { success = false, message = result.Error });
        return File(result.Data!.Data, result.Data.ContentType, result.Data.FileName);
    }

    [HttpPost("{id:guid}/send-email")]
    public async Task<IActionResult> SendEmail(Guid id, SendEmailRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.EmailExportAsync(id, dto.ToAddress, dto.Options, ct);
        return result.Succeeded
            ? Ok(new { success = true, message = "Export emailed successfully." })
            : BadRequest(new { success = false, message = result.Error });
    }

    /// <summary>Fetches ownership-checked entities for a batch endpoint - returns an error result the caller should return as-is if any id fails.</summary>
    private async Task<(List<Domain.Entities.Document>? documents, IActionResult? error)> GetOwnedDocumentsAsync(List<Guid> ids, CancellationToken ct)
    {
        var documents = new List<Domain.Entities.Document>();
        foreach (var id in ids)
        {
            var (document, error) = await GetOwnedDocumentAsync(id, ct);
            if (error is not null) return (null, error);
            documents.Add(document!);
        }
        return (documents, null);
    }

    /// <summary>Combined Excel export for several documents at once - one row per document, columns = field keys.</summary>
    [HttpPost("batch-export")]
    public async Task<IActionResult> BatchExport(BatchDocumentIdsRequestDto dto, CancellationToken ct)
    {
        if (dto.DocumentIds is null || dto.DocumentIds.Count == 0)
            return BadRequest(new { success = false, message = "No documents selected." });

        var (documents, error) = await GetOwnedDocumentsAsync(dto.DocumentIds, ct);
        if (error is not null) return error;

        var result = await _service.ExportBatchAsync(documents!, dto.ExportMode, dto.Options, ct);
        if (!result.Succeeded) return NotFound(new { success = false, message = result.Error });

        return File(result.Data!.Data, result.Data.ContentType, result.Data.FileName);
    }

    [HttpPost("batch-send-email")]
    public async Task<IActionResult> BatchSendEmail(BatchSendEmailRequestDto dto, CancellationToken ct)
    {
        if (dto.DocumentIds is null || dto.DocumentIds.Count == 0)
            return BadRequest(new { success = false, message = "No documents selected." });

        var (documents, error) = await GetOwnedDocumentsAsync(dto.DocumentIds, ct);
        if (error is not null) return error;

        var result = await _service.EmailBatchExportAsync(documents!, dto.ToAddress, dto.ExportMode, dto.Options, ct);
        return result.Succeeded
            ? Ok(new { success = true, message = "Export emailed successfully." })
            : BadRequest(new { success = false, message = result.Error });
    }

    [HttpGet("mine")]
    [Authorize]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var docs = await _documents.GetByUserIdAsync(userId, ct);
        return Ok(new
        {
            success = true,
            documents = docs.Select(d => new DocumentSummaryDto(d.Id, d.OriginalFileName, d.PageCount, d.RequiresOcr, d.Status.ToString(), d.CreatedAtUtc, d.FailureReason, d.FileSizeBytes, d.UploadBatchId))
        });
    }
}
