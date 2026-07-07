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
    /// Uploads one or more PDFs. Anonymous users get up to
    /// DocumentProcessingService.FreeUploadLimit uploads total, enforced
    /// server-side against the caller's IP address (never trust a client-supplied
    /// counter for this). Logged-in users must have an active subscription with
    /// remaining monthly capacity; otherwise they're redirected to /plans exactly
    /// like an anonymous user who hit the free limit.
    /// </summary>
    [HttpPost("upload")]
    [EnforcesUploadLimit]
    [RequestSizeLimit(30_000_000)]
    public async Task<IActionResult> Upload(
        [FromForm] List<IFormFile> files,
        [FromForm] string? extractionMode = "Dynamic",
        [FromForm] string? requestedFields = null,
        CancellationToken ct = default)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { success = false, message = "Please select at least one PDF file to upload." });

        var isFormatted = string.Equals(extractionMode, "Formatted", StringComparison.OrdinalIgnoreCase);
        if (isFormatted && string.IsNullOrWhiteSpace(requestedFields))
            return BadRequest(new { success = false, message = "List the field names to extract, separated by commas, or switch to Dynamic mode." });

        var userId = _currentUser.UserId;
        Domain.Entities.Subscription? subscription = null;

        if (userId is null)
        {
            var ip = _currentUser.IpAddress ?? "unknown";
            var alreadyUsed = await _documents.CountAnonymousUploadsByIpAsync(ip, ct);
            if (alreadyUsed + files.Count > DocumentProcessingService.FreeUploadLimit)
            {
                return StatusCode(402, new
                {
                    success = false,
                    message = "You've used your 2 free extractions. Please sign in and choose a plan to continue.",
                    errorCode = "FREE_LIMIT_REACHED",
                    redirectTo = "/plans"
                });
            }
        }
        else
        {
            subscription = await _db.Subscriptions
                .Include(s => s.Plan)
                .Where(s => s.UserId == userId && s.Status == SubscriptionStatus.Active)
                .OrderByDescending(s => s.StartAtUtc)
                .FirstOrDefaultAsync(ct);

            var hasUnlimitedPlan = subscription?.Plan.MonthlyUploadLimit == -1;
            var overLimit = subscription is null
                || (!hasUnlimitedPlan && subscription.UploadsUsedThisCycle + files.Count > subscription.Plan.MonthlyUploadLimit);

            if (overLimit)
            {
                return StatusCode(402, new
                {
                    success = false,
                    message = subscription is null
                        ? "Please choose a plan to start extracting data."
                        : "You've reached your plan's monthly upload limit. Please upgrade to continue.",
                    errorCode = "PLAN_LIMIT_REACHED",
                    redirectTo = "/plans"
                });
            }
        }

        var uploadsRoot = _config["FileStorage:UploadsRootPath"] ?? "./uploads";
        Directory.CreateDirectory(uploadsRoot);

        var results = new List<DocumentSummaryDto>();
        foreach (var file in files)
        {
            if (Path.GetExtension(file.FileName).ToLowerInvariant() != ".pdf")
                return BadRequest(new { success = false, message = $"'{file.FileName}' is not a PDF file." });

            var storedName = $"{Guid.NewGuid()}.pdf";
            var storedPath = Path.Combine(uploadsRoot, storedName);
            await using (var stream = new FileStream(storedPath, FileMode.Create))
                await file.CopyToAsync(stream, ct);

            var result = await _service.UploadAndQueueAsync(
                userId, file.FileName, storedPath, file.Length, _currentUser.IpAddress,
                isFormatted ? "Formatted" : "Dynamic", isFormatted ? requestedFields : null, ct);
            if (!result.Succeeded)
                return BadRequest(new { success = false, message = result.Error });

            results.Add(result.Data!);

            // NOTE: for a smooth "animated processing" UX on the frontend, kick this
            // off via a background job/queue (e.g. Hangfire or a hosted service) and
            // let the frontend poll GET /api/documents/{id} for status. Calling it
            // inline here for scaffold simplicity.
            // Deliberately CancellationToken.None, not `ct`: this OCR + AI call can
            // legitimately take many seconds, and a dropped client connection (page
            // reload, network blip, tab close) must not abort processing that's
            // already underway - the document should still finish extracting even
            // if this particular response never reaches the browser.
            _ = await _service.ProcessDocumentAsync(result.Data!.Id, CancellationToken.None);
        }

        if (subscription is not null)
        {
            subscription.UploadsUsedThisCycle += files.Count;
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new { success = true, documents = results });
    }

    /// <summary>Anonymous (unowned) documents are viewable by anyone with the id, matching the anonymous upload flow; documents owned by a user are only viewable by that user.</summary>
    private async Task<(Domain.Entities.Document? document, IActionResult? error)> GetOwnedDocumentAsync(Guid id, CancellationToken ct)
    {
        var document = await _documents.GetWithDetailsAsync(id, ct);
        if (document is null) return (null, NotFound(new { success = false, message = "Document not found." }));
        if (document.UserId is not null && document.UserId != _currentUser.UserId)
            return (null, StatusCode(403, new { success = false, message = "You don't have permission to access this document." }));
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
                f.FieldValue,
                f.PageNumber,
                f.WasEditedByUser
            })
        });
    }

    [HttpPut("{id:guid}/fields")]
    public async Task<IActionResult> UpdateField(Guid id, UpdateFieldRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.UpdateFieldAsync(id, dto.FieldId, dto.NewValue, dto.NewKey, ct);
        return result.Succeeded ? Ok(new { success = true }) : NotFound(new { success = false, message = result.Error });
    }

    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.ExportToExcelAsync(id, ct);
        if (!result.Succeeded) return NotFound(new { success = false, message = result.Error });
        return File(result.Data!, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "datamint-export.xlsx");
    }

    [HttpPost("{id:guid}/send-email")]
    public async Task<IActionResult> SendEmail(Guid id, SendEmailRequestDto dto, CancellationToken ct)
    {
        var (_, error) = await GetOwnedDocumentAsync(id, ct);
        if (error is not null) return error;

        var result = await _service.EmailExportAsync(id, dto.ToAddress, ct);
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

        var result = await _service.ExportBatchToExcelAsync(documents!, ct);
        if (!result.Succeeded) return NotFound(new { success = false, message = result.Error });
        return File(result.Data!, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "datamint-batch-export.xlsx");
    }

    [HttpPost("batch-send-email")]
    public async Task<IActionResult> BatchSendEmail(BatchSendEmailRequestDto dto, CancellationToken ct)
    {
        if (dto.DocumentIds is null || dto.DocumentIds.Count == 0)
            return BadRequest(new { success = false, message = "No documents selected." });

        var (documents, error) = await GetOwnedDocumentsAsync(dto.DocumentIds, ct);
        if (error is not null) return error;

        var result = await _service.EmailBatchExportAsync(documents!, dto.ToAddress, ct);
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
            documents = docs.Select(d => new DocumentSummaryDto(d.Id, d.OriginalFileName, d.PageCount, d.RequiresOcr, d.Status.ToString(), d.CreatedAtUtc))
        });
    }
}
