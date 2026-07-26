using System.Text.Json;
using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Datamint.Application.Services;

/// <summary>
/// Orchestrates the whole "upload -> extract -> preview/edit -> export -> email" flow.
/// This is the single place that talks to repositories + the AI extraction service, keeping
/// controllers thin and every other service single-purpose. AI provider/model/prompt
/// customization is resolved per-user via IExtractionTierResolver, entirely invisible to the
/// end user.
/// </summary>
public class DocumentProcessingService
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".webp", ".bmp" };

    private readonly IDocumentRepository _documents;
    private readonly IUserRepository _users;
    private readonly IPdfTextExtractionService _textExtraction;
    private readonly IPageImageRenderingService _pageImages;
    private readonly IAiFieldExtractionServiceFactory _aiFactory;
    private readonly IExtractionTierResolver _tierResolver;
    private readonly IExcelExportService _excel;
    private readonly IJsonExportService _json;
    private readonly IEmailService _email;
    private readonly IAuditService _audit;
    private readonly ILogger<DocumentProcessingService> _logger;
    private readonly string _appName;
    private readonly int _maxPageImagesPerDocument;

    public DocumentProcessingService(
        IDocumentRepository documents,
        IUserRepository users,
        IPdfTextExtractionService textExtraction,
        IPageImageRenderingService pageImages,
        IAiFieldExtractionServiceFactory aiFactory,
        IExtractionTierResolver tierResolver,
        IExcelExportService excel,
        IJsonExportService json,
        IEmailService email,
        IAuditService audit,
        ILogger<DocumentProcessingService> logger,
        IConfiguration config)
    {
        _documents = documents;
        _users = users;
        _textExtraction = textExtraction;
        _pageImages = pageImages;
        _aiFactory = aiFactory;
        _tierResolver = tierResolver;
        _excel = excel;
        _json = json;
        _email = email;
        _audit = audit;
        _logger = logger;
        _appName = config["App:Name"] ?? "Datamint";
        _maxPageImagesPerDocument = int.TryParse(config["Ai:MaxPageImagesPerDocument"], out var maxImages) ? maxImages : 20;
    }

    public static bool IsImageFile(string originalFileName) => ImageExtensions.Contains(Path.GetExtension(originalFileName));

    private static string ImageMediaType(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".bmp" => "image/bmp",
        _ => "image/png"
    };

    /// <summary>Picks PDF-text-extraction vs. a synthetic single "page" of empty text (for a
    /// direct image upload, whose actual content only ever reaches the AI as an image, never
    /// OCR'd text) - the one place both the upload pre-check and the lightweight /peek endpoint
    /// need this decision, so a PDF and a photo/scan are handled identically everywhere
    /// downstream. An image is always exactly 1 page.</summary>
    public Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, string originalFileName, CancellationToken ct = default) =>
        IsImageFile(originalFileName)
            ? Task.FromResult(new PdfTextExtractionResultDto(1, new List<PdfPageTextDto> { new(1, "") }))
            : _textExtraction.ExtractTextAsync(filePath, ct);

    public async Task<Result<DocumentSummaryDto>> UploadAndQueueAsync(
        Guid userId, string originalFileName, string storedFilePath, string contentType, long fileSizeBytes,
        string extractionMode = "Dynamic", string? requestedFields = null, Guid? uploadBatchId = null, CancellationToken ct = default)
    {
        // Plan limit gate is enforced server-side in DocumentsController before this method is called.
        var user = await _users.GetByIdAsync(userId, ct);
        if (user is null)
            return Result<DocumentSummaryDto>.Failure("User not found.", "USER_NOT_FOUND");

        var document = new Document
        {
            UserId = userId,
            OriginalFileName = originalFileName,
            StoredFilePath = storedFilePath,
            ContentType = contentType,
            FileSizeBytes = fileSizeBytes,
            Status = DocumentStatus.Uploaded,
            ExtractionMode = extractionMode == "Formatted" ? "Formatted" : "Dynamic",
            RequestedFields = extractionMode == "Formatted" ? requestedFields : null
        };
        if (uploadBatchId is not null) document.UploadBatchId = uploadBatchId.Value;

        await _documents.AddAsync(document, ct);
        await _documents.SaveChangesAsync(ct);

        await _audit.LogAsync("Document.Upload", userId, "Document", document.Id.ToString(),
            $"{{\"fileName\":\"{originalFileName}\",\"sizeBytes\":{fileSizeBytes}}}", true, ct);

        return Result<DocumentSummaryDto>.Success(ToSummaryDto(document));
    }

    /// <summary>
    /// Runs text extraction then hands the page text (plus page images, for scanned/image
    /// content) to the AI for structured key/value extraction. Designed to be called from a
    /// background job/queue in production so the upload endpoint returns instantly.
    /// </summary>
    /// <param name="preExtractedText">
    /// The caller (DocumentsController.Upload) already has to know every file's page count
    /// BEFORE running AI extraction, to gate the whole batch against remaining plan quota up
    /// front rather than charging for pages after the fact - it already ran text extraction
    /// once during that pre-check, so passing the result through here avoids parsing the same
    /// file a second time.
    /// </param>
    public async Task<Result<DocumentSummaryDto>> ProcessDocumentAsync(
        Guid documentId, IReadOnlyList<int>? selectedPageNumbers = null, PdfTextExtractionResultDto? preExtractedText = null, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null)
            return Result<DocumentSummaryDto>.Failure("Document not found.", "NOT_FOUND");

        try
        {
            // `document` came from GetWithDetailsAsync on this same DbContext, so it's already
            // tracked - just mutate it and SaveChanges. Do NOT call any repository
            // "Update(document)" anywhere in this method: Update() forces the *entire* tracked
            // graph (including the DocumentPage/ExtractedField children added below) from Added
            // to Modified, so EF emits UPDATEs for child rows that don't exist yet ->
            // DbUpdateConcurrencyException (0 rows affected). New pages/fields are added below
            // via _documents.AddPage/AddExtractedField (directly through their own DbSet) rather
            // than via `document.Pages.Add(...)`/`document.ExtractedFields.Add(...)` - the latter
            // was empirically found to leave the new child tracked as Modified instead of Added
            // on an already-tracked parent in this app, hitting the exact same concurrency
            // exception Update() causes, for a different underlying reason.
            document.Status = DocumentStatus.Processing;

            var tier = await _tierResolver.ResolveForUserAsync(document.UserId, ct);
            document.ExtractionTierId = tier.Id;
            await _documents.SaveChangesAsync(ct);

            var textResult = preExtractedText ?? await ExtractTextAsync(document.StoredFilePath, document.OriginalFileName, ct);
            document.PageCount = textResult.PageCount;

            var pagesToProcess = selectedPageNumbers is { Count: > 0 }
                ? textResult.Pages.Where(p => selectedPageNumbers.Contains(p.PageNumber)).ToList()
                : textResult.Pages;

            // Rendered only here, on the already page-selection-filtered set actually going to
            // the AI - never inside IPdfTextExtractionService's plain ExtractTextAsync, which
            // /peek and the upload quota-gating pre-check also call and which must stay fast/
            // text-only (see IPageImageRenderingService for why).
            var pagesWithImages = await AttachPageImagesAsync(document, pagesToProcess, ct);

            foreach (var page in pagesWithImages)
            {
                _documents.AddPage(new DocumentPage
                {
                    DocumentId = document.Id,
                    PageNumber = page.PageNumber,
                    RawText = page.Text
                });
            }

            List<string>? requestedFieldsList = document.ExtractionMode == "Formatted" && !string.IsNullOrWhiteSpace(document.RequestedFields)
                ? document.RequestedFields.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList()
                : null;

            var aiService = _aiFactory.GetService(tier.AiProvider);
            var aiResult = await aiService.ExtractStructuredDataAsync(pagesWithImages, tier, requestedFieldsList, ct);
            if (!aiResult.Success)
            {
                document.Status = DocumentStatus.Failed;
                document.FailureReason = aiResult.ErrorMessage ?? "AI extraction failed.";
                await _documents.SaveChangesAsync(ct);
                await _audit.LogAsync("Document.Extraction", document.UserId, "Document", document.Id.ToString(), document.FailureReason, false, ct);
                // A failed extraction is a normal, expected outcome the caller needs to display
                // (not an HTTP-level error) - so this is still Result.Success, just carrying a
                // DTO whose Status/FailureReason say what happened.
                return Result<DocumentSummaryDto>.Success(ToSummaryDto(document));
            }

            // The AI assigns each field its own "priority" (lower = more important) fresh per
            // document - ordering by that (stable, so equal/absent priorities keep their
            // original page/response order) is what puts important sections at the top,
            // entirely from the model's own judgment rather than any hardcoded field-name rule.
            int order = 0;
            foreach (var field in aiResult.Fields.OrderBy(f => f.Priority ?? int.MaxValue))
            {
                var semanticType = string.IsNullOrWhiteSpace(field.SemanticType) ? "Text" : field.SemanticType;
                _documents.AddExtractedField(new ExtractedField
                {
                    DocumentId = document.Id,
                    FieldKey = field.Key,
                    OriginalFieldKey = field.Key,
                    FieldValue = field.Value,
                    OriginalAiValue = field.Value,
                    PageNumber = field.PageNumber,
                    SemanticType = semanticType,
                    OriginalSemanticType = semanticType,
                    SectionLabel = string.IsNullOrWhiteSpace(field.SectionLabel) ? "General" : field.SectionLabel,
                    SortOrder = order++
                });
            }

            document.Status = DocumentStatus.Extracted;
            await _documents.SaveChangesAsync(ct);

            await _audit.LogAsync("Document.Extraction", document.UserId, "Document", document.Id.ToString(),
                $"{{\"fieldsExtracted\":{aiResult.Fields.Count}}}", true, ct);

            return Result<DocumentSummaryDto>.Success(ToSummaryDto(document));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected failure processing document {DocumentId}", documentId);
            document.Status = DocumentStatus.Failed;
            document.FailureReason = "Unexpected error while processing the document. Please try again.";
            await _documents.SaveChangesAsync(ct);
            await _audit.LogAsync("Document.Extraction", document.UserId, "Document", document.Id.ToString(), ex.Message, false, ct);
            return Result<DocumentSummaryDto>.Success(ToSummaryDto(document));
        }
    }

    /// <summary>
    /// Renders an image for each page (capped to _maxPageImagesPerDocument - every page's text
    /// still reaches the AI regardless, only the accompanying image is capped) and merges it
    /// onto the corresponding page. A direct image upload's whole content IS the image - read
    /// straight off disk, no rendering needed. A rendering failure here must never block
    /// extraction - it just falls back to the text-only pages that already worked before this.
    /// </summary>
    private async Task<List<PdfPageTextDto>> AttachPageImagesAsync(Document document, List<PdfPageTextDto> pages, CancellationToken ct)
    {
        try
        {
            List<PageImageDto> images;
            if (IsImageFile(document.OriginalFileName))
            {
                var bytes = await File.ReadAllBytesAsync(document.StoredFilePath, ct);
                images = new List<PageImageDto> { new(1, bytes, ImageMediaType(Path.GetExtension(document.OriginalFileName))) };
            }
            else
            {
                var pageNumbers = pages.Select(p => p.PageNumber).Take(_maxPageImagesPerDocument).ToList();
                images = await _pageImages.RenderPagesAsync(document.StoredFilePath, pageNumbers, ct);
            }

            return pages.Select(page =>
            {
                var image = images.FirstOrDefault(i => i.PageNumber == page.PageNumber);
                return image is null ? page : page with { ImageBytes = image.ImageBytes, ImageMediaType = image.MediaType };
            }).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not attach page images for document {DocumentId}; continuing with text-only extraction.", document.Id);
            return pages;
        }
    }

    private static DocumentSummaryDto ToSummaryDto(Document document) => new(
        document.Id, document.OriginalFileName, document.ContentType, document.PageCount,
        document.Status.ToString(), document.CreatedAtUtc, document.FailureReason, document.FileSizeBytes,
        document.UploadBatchId);

    /// <summary>
    /// Runs once per bulk upload, after every document in the batch has already been extracted
    /// independently: reconciles field labels across the whole batch (e.g. one document's
    /// "Invoice No" and another's "Invoice Number" become the same canonical "Invoice Number")
    /// so the combined batch view/export puts them in the same column. A no-op for
    /// single-document uploads, and any failure here just leaves field keys as originally
    /// extracted rather than blocking or failing the upload that triggered it.
    /// </summary>
    public async Task HarmonizeBatchFieldKeysAsync(List<Guid> documentIds, CancellationToken ct = default)
    {
        if (documentIds.Count < 2) return;

        var documents = new List<Document>();
        foreach (var id in documentIds)
        {
            var doc = await _documents.GetWithDetailsAsync(id, ct);
            if (doc is not null && doc.ExtractedFields.Count > 0) documents.Add(doc);
        }
        if (documents.Count < 2) return;

        var distinctKeys = documents.SelectMany(d => d.ExtractedFields.Select(f => f.FieldKey)).Distinct().ToList();
        if (distinctKeys.Count < 2) return;

        var tier = await _tierResolver.ResolveForUserAsync(documents[0].UserId, ct);
        var aiService = _aiFactory.GetService(tier.AiProvider);
        var mapping = await aiService.HarmonizeFieldKeysAsync(distinctKeys, tier, ct);
        if (mapping.Count == 0) return;

        var renamedCount = 0;
        foreach (var doc in documents)
        {
            foreach (var field in doc.ExtractedFields)
            {
                if (mapping.TryGetValue(field.FieldKey, out var canonical)
                    && !string.IsNullOrWhiteSpace(canonical) && canonical != field.FieldKey)
                {
                    field.FieldKey = canonical;
                    renamedCount++;
                }
            }
        }

        if (renamedCount > 0)
        {
            await _documents.SaveChangesAsync(ct);
            await _audit.LogAsync("Document.BatchFieldsHarmonized", documents[0].UserId, ct: ct,
                details: $"{{\"documentCount\":{documents.Count},\"fieldsRenamed\":{renamedCount}}}");
        }
    }

    public async Task<Result<ExtractedFieldEditDto>> UpdateFieldAsync(Guid documentId, Guid fieldId, string? newValue, string? newKey = null, bool? includeInExport = null, string? newSemanticType = null, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result<ExtractedFieldEditDto>.Failure("Document not found.", "NOT_FOUND");

        var field = document.ExtractedFields.FirstOrDefault(f => f.Id == fieldId);
        if (field is null) return Result<ExtractedFieldEditDto>.Failure("Field not found.", "NOT_FOUND");

        var previousValue = field.FieldValue;
        var previousKey = field.FieldKey;

        // Rows extracted before OriginalSemanticType existed have it stored as null. Left as-is,
        // "null != <any type the user ever picks>" is permanently true, so a legacy field's
        // "edited" flag could never clear again even after being set back to its own current
        // type - the exact "re-edited back to previous still shows as edited" bug reported for
        // real documents. Backfill it lazily, from the type as it stood before this edit, the
        // first time such a field is touched; every edit after that compares correctly.
        if (field.OriginalSemanticType is null) field.OriginalSemanticType = field.SemanticType;

        field.FieldValue = newValue;
        if (!string.IsNullOrWhiteSpace(newKey))
            field.FieldKey = newKey.Trim();
        if (!string.IsNullOrWhiteSpace(newSemanticType)) field.SemanticType = newSemanticType.Trim();
        // "Edited" means the user actually changed something from what the AI produced - the
        // value, the label, or the type (e.g. correcting a misdetected Number to Currency) all
        // count; only the include-in-export toggle is excluded, since that's an export
        // preference rather than a content correction. Comparing against the CURRENT state each
        // time (not a one-way "was ever touched" flag) means editing a value back to exactly
        // what the AI originally found correctly clears the "edited" indicator again.
        field.WasEditedByUser = field.OriginalAiValue != field.FieldValue
            || field.OriginalFieldKey != field.FieldKey
            || field.OriginalSemanticType != field.SemanticType;
        if (includeInExport is not null) field.IncludeInExport = includeInExport.Value;

        await _documents.SaveChangesAsync(ct);

        var diff = JsonSerializer.Serialize(new
        {
            fieldId,
            key = new { from = previousKey, to = field.FieldKey },
            value = new { from = previousValue, to = field.FieldValue }
        });
        await _audit.LogAsync("Document.FieldUpdated", document.UserId, "Document", documentId.ToString(), diff, ct: ct);

        return Result<ExtractedFieldEditDto>.Success(ToEditDto(field));
    }

    /// <summary>
    /// Persists a drag-and-drop reorder: the whole document's fields are renumbered from the
    /// dropped order (not just the moved one) so SortOrder stays gap/collision-free across
    /// repeated moves, and a field's SectionLabel is updated if it was dropped into a different
    /// section's list.
    /// </summary>
    public async Task<Result> ReorderFieldsAsync(Guid documentId, List<ReorderFieldDto> fields, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result.Failure("Document not found.", "NOT_FOUND");

        var byId = document.ExtractedFields.ToDictionary(f => f.Id);
        foreach (var item in fields)
        {
            if (!byId.TryGetValue(item.FieldId, out var field)) continue;
            field.SortOrder = item.SortOrder;
            field.SectionLabel = item.SectionLabel;
        }

        await _documents.SaveChangesAsync(ct);
        await _audit.LogAsync("Document.FieldsReordered", document.UserId, "Document", documentId.ToString(), $"{{\"fieldCount\":{fields.Count}}}", true, ct);
        return Result.Success();
    }

    /// <summary>Renames a section for this document only - fields already dragged out of it
    /// under the old name are unaffected, matching how a rename is scoped to "current members".</summary>
    public async Task<Result> RenameSectionAsync(Guid documentId, string oldLabel, string newLabel, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(newLabel)) return Result.Failure("Section name can't be empty.", "INVALID_NAME");

        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result.Failure("Document not found.", "NOT_FOUND");

        var trimmed = newLabel.Trim();
        var renamedCount = 0;
        foreach (var field in document.ExtractedFields)
        {
            var currentLabel = string.IsNullOrWhiteSpace(field.SectionLabel) ? "General" : field.SectionLabel;
            if (currentLabel == oldLabel)
            {
                field.SectionLabel = trimmed;
                renamedCount++;
            }
        }

        if (renamedCount > 0)
        {
            await _documents.SaveChangesAsync(ct);
            await _audit.LogAsync("Document.SectionRenamed", document.UserId, "Document", documentId.ToString(), $"{{\"from\":\"{oldLabel}\",\"to\":\"{trimmed}\"}}", true, ct);
        }

        return Result.Success();
    }

    private static readonly ExportOptionsDto DefaultExportOptions = new();

    public async Task<Result<ExportResultDto>> ExportDocumentAsync(Guid documentId, ExportOptionsDto? options = null, CancellationToken ct = default)
    {
        options ??= DefaultExportOptions;
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result<ExportResultDto>.Failure("Document not found.", "NOT_FOUND");

        var fields = document.ExtractedFields.OrderBy(f => f.SortOrder).ToList();
        var result = options.Format == ExportFormat.Json
            ? _json.ExportSingle(document.OriginalFileName, fields, options.IncludedFieldIds)
            : _excel.ExportSingle(document.OriginalFileName, fields, options.Layout, options.IncludedFieldIds);

        document.Status = DocumentStatus.Exported;
        await _documents.SaveChangesAsync(ct);

        await _audit.LogAsync("Document.Export", document.UserId, "Document", document.Id.ToString(), $"{{\"format\":\"{options.Format}\"}}", true, ct);
        return Result<ExportResultDto>.Success(result);
    }

    /// <summary>
    /// Several documents at once - the ownership check for each id already happened in the
    /// controller before these tracked entities were fetched, so this trusts the list.
    /// exportMode picks the shape when options.Format is Excel: "SingleSheet" (default - one
    /// combined sheet, rows=documents, columns=field keys), "MultipleSheets" (one .xlsx, one tab
    /// per document), or "SeparateFiles" (a .zip with one standalone .xlsx per document).
    /// Ignored when options.Format is Json, which always returns one structured payload.
    /// </summary>
    public async Task<Result<ExportResultDto>> ExportBatchAsync(List<Document> documents, string exportMode = "SingleSheet", ExportOptionsDto? options = null, CancellationToken ct = default)
    {
        if (documents.Count == 0) return Result<ExportResultDto>.Failure("No documents to export.", "NOT_FOUND");
        options ??= DefaultExportOptions;

        var included = options.IncludedDocumentIds is { Count: > 0 } ids
            ? documents.Where(d => ids.Contains(d.Id)).ToList()
            : documents;
        var docFieldPairs = included.Select(d => (d.OriginalFileName, d.ExtractedFields.OrderBy(f => f.SortOrder).ToList())).ToList();

        ExportResultDto result = options.Format == ExportFormat.Json
            ? _json.ExportBatch(docFieldPairs)
            : exportMode switch
            {
                "MultipleSheets" => _excel.ExportBatchMultipleSheets(docFieldPairs, options.Layout),
                "SeparateFiles" => _excel.ExportBatchSeparateFiles(docFieldPairs, options.Layout),
                _ => _excel.ExportBatchSingleSheet(docFieldPairs, options.Layout)
            };

        foreach (var document in documents)
            document.Status = DocumentStatus.Exported;
        await _documents.SaveChangesAsync(ct);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchExport", document.UserId, "Document", document.Id.ToString(), $"{{\"exportMode\":\"{exportMode}\",\"format\":\"{options.Format}\"}}", true, ct);

        return Result<ExportResultDto>.Success(result);
    }

    public async Task<Result> EmailBatchExportAsync(List<Document> documents, string toAddress, string? cc, string exportMode = "SingleSheet", ExportOptionsDto? options = null, CancellationToken ct = default)
    {
        options ??= DefaultExportOptions;
        var exportResult = await ExportBatchAsync(documents, exportMode, options, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var (data, _, attachmentName) = exportResult.Data!;
        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-batch-export-{Guid.NewGuid()}{Path.GetExtension(attachmentName)}");
        await File.WriteAllBytesAsync(tempPath, data, ct);

        var bodyDescription = options.Format == ExportFormat.Json
            ? $"Please find attached the combined extracted data (JSON) for {documents.Count} document(s) from {_appName}."
            : exportMode switch
            {
                "MultipleSheets" => $"Please find attached one workbook with a separate sheet for each of the {documents.Count} document(s) from {_appName}.",
                "SeparateFiles" => $"Please find attached a zip file with a separate spreadsheet for each of the {documents.Count} document(s) from {_appName}.",
                _ => $"Please find attached the combined extracted data for {documents.Count} document(s) from {_appName}."
            };
        var body = EmailTemplateHelper.Wrap(
            appName: _appName,
            title: "Your export is ready",
            greeting: "Hi,",
            bodyHtml: $"<p>{bodyDescription}</p>");

        var sent = await SendWithCcAsync(toAddress, cc, $"Your {_appName} extracted data export", body, tempPath, attachmentName, ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchEmailSent", document.UserId, "Document", document.Id.ToString(), $"{{\"to\":\"{toAddress}\",\"exportMode\":\"{exportMode}\",\"format\":\"{options.Format}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    public async Task<Result> EmailExportAsync(Guid documentId, string toAddress, string? cc, ExportOptionsDto? options = null, CancellationToken ct = default)
    {
        options ??= DefaultExportOptions;
        var exportResult = await ExportDocumentAsync(documentId, options, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var (data, _, attachmentName) = exportResult.Data!;
        // A fresh Guid, not just documentId, so two concurrent email requests for the same
        // document (a double-click, or two browser tabs) never race on the same temp file.
        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-export-{documentId}-{Guid.NewGuid()}{Path.GetExtension(attachmentName)}");
        await File.WriteAllBytesAsync(tempPath, data, ct);

        var body = EmailTemplateHelper.Wrap(
            appName: _appName,
            title: "Your export is ready",
            greeting: "Hi,",
            bodyHtml: $"<p>Please find attached the extracted data exported from {_appName}.</p>");

        var sent = await SendWithCcAsync(toAddress, cc, $"Your {_appName} extracted data export", body, tempPath, attachmentName, ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        var document = await _documents.GetByIdAsync(documentId, ct);
        await _audit.LogAsync("Document.EmailSent", document?.UserId, "Document", documentId.ToString(),
            $"{{\"to\":\"{toAddress}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    /// <summary>IEmailService.SendAsync is a single-recipient primitive (matches how every
    /// other email in this app is sent); CC is layered on here, for export emails only, by
    /// appending a plain ", cc@address" suffix onto the To line via a second send when set -
    /// MailKit's underlying SMTP client already supports true Cc, so this is a thin adapter
    /// point to revisit if CC needs grow beyond "export emails only" elsewhere in the app.</summary>
    private async Task<bool> SendWithCcAsync(string toAddress, string? cc, string subject, string body, string attachmentPath, string attachmentName, CancellationToken ct)
    {
        var primarySent = await _email.SendAsync(toAddress, subject, body, attachmentPath, attachmentName, ct);
        if (!primarySent || string.IsNullOrWhiteSpace(cc)) return primarySent;

        foreach (var ccAddress in cc.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            await _email.SendAsync(ccAddress, subject, body, attachmentPath, attachmentName, ct);

        return true;
    }

    // Single place pre-existing (pre-migration) null SemanticType/SectionLabel rows fall back to
    // "Generic"/"General" for every reader (frontend grouping, both export formats) - newly
    // extracted rows already have a concrete value baked in by ProcessDocumentAsync's merge loop.
    private static ExtractedFieldEditDto ToEditDto(ExtractedField f) => new(
        f.Id, f.FieldKey, f.OriginalFieldKey, f.FieldValue, f.PageNumber, f.WasEditedByUser,
        string.IsNullOrWhiteSpace(f.SemanticType) ? "Text" : f.SemanticType,
        string.IsNullOrWhiteSpace(f.SectionLabel) ? "General" : f.SectionLabel,
        f.IncludeInExport, f.SortOrder, f.OriginalAiValue, f.OriginalSemanticType);

    public static DocumentDetailDto MapToDetailDto(Document document) => new(
        document.Id,
        document.OriginalFileName,
        document.ContentType,
        document.PageCount,
        document.Status.ToString(),
        document.ExtractedFields
            .OrderBy(f => f.SortOrder)
            .Select(ToEditDto)
            .ToList());
}
