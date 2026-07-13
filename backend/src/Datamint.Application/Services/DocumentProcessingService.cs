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
/// This is the single place that talks to repositories + the AI extraction service,
/// keeping controllers thin and every other service single-purpose.
/// </summary>
public class DocumentProcessingService
{
    private readonly IDocumentRepository _documents;
    private readonly IUserRepository _users;
    private readonly IPdfTextExtractionService _textExtraction;
    private readonly IAiFieldExtractionService _aiExtraction;
    private readonly IExcelExportService _excel;
    private readonly IEmailService _email;
    private readonly IAuditService _audit;
    private readonly ILogger<DocumentProcessingService> _logger;
    private readonly string _appName;

    public DocumentProcessingService(
        IDocumentRepository documents,
        IUserRepository users,
        IPdfTextExtractionService textExtraction,
        IAiFieldExtractionService aiExtraction,
        IExcelExportService excel,
        IEmailService email,
        IAuditService audit,
        ILogger<DocumentProcessingService> logger,
        IConfiguration config)
    {
        _documents = documents;
        _users = users;
        _textExtraction = textExtraction;
        _aiExtraction = aiExtraction;
        _excel = excel;
        _email = email;
        _audit = audit;
        _logger = logger;
        _appName = config["App:Name"] ?? "Datamint";
    }

    public async Task<Result<DocumentSummaryDto>> UploadAndQueueAsync(
        Guid userId, string originalFileName, string storedFilePath, long fileSizeBytes, string? uploaderIp,
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
            FileSizeBytes = fileSizeBytes,
            UploaderIpAddress = uploaderIp,
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
    /// Runs text/OCR extraction then hands the page text to Claude for structured
    /// key/value extraction. Designed to be called from a background job/queue in
    /// production so the upload endpoint returns instantly - see README notes.
    /// </summary>
    /// <param name="preExtractedText">
    /// The caller (DocumentsController.Upload) now has to know every file's page count
    /// BEFORE running AI extraction, to gate the whole batch against remaining plan quota
    /// up front rather than charging for pages after the fact. That means it already ran
    /// PdfPig text extraction once during that pre-check - passing the result through here
    /// avoids parsing (and re-running OCR on scanned pages via) the same PDF a second time.
    /// </param>
    public async Task<Result<DocumentSummaryDto>> ProcessDocumentAsync(
        Guid documentId, PdfTextExtractionResultDto? preExtractedText = null, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null)
            return Result<DocumentSummaryDto>.Failure("Document not found.", "NOT_FOUND");

        try
        {
            // `document` came from GetWithDetailsAsync on this same DbContext, so it's
            // already tracked - just mutate it and SaveChanges. Do NOT call
            // _documents.Update(document) anywhere in this method: Update() forces the
            // *entire* tracked graph (including the DocumentPage/ExtractedField children
            // added below) from Added to Modified, so EF emits UPDATEs for child rows
            // that don't exist yet -> DbUpdateConcurrencyException (0 rows affected).
            document.Status = DocumentStatus.Processing;
            await _documents.SaveChangesAsync(ct);

            var textResult = preExtractedText ?? await _textExtraction.ExtractTextAsync(document.StoredFilePath, ct);
            document.PageCount = textResult.PageCount;
            document.RequiresOcr = textResult.RequiredOcr;

            foreach (var page in textResult.Pages)
            {
                _documents.AddPage(new DocumentPage
                {
                    DocumentId = document.Id,
                    PageNumber = page.PageNumber,
                    RawText = page.Text,
                    UsedOcr = page.UsedOcr
                });
            }

            List<string>? requestedFieldsList = document.ExtractionMode == "Formatted" && !string.IsNullOrWhiteSpace(document.RequestedFields)
                ? document.RequestedFields.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList()
                : null;

            var aiResult = await _aiExtraction.ExtractStructuredDataAsync(textResult.Pages, requestedFieldsList, ct);
            if (!aiResult.Success)
            {
                document.Status = DocumentStatus.Failed;
                document.FailureReason = aiResult.ErrorMessage ?? "AI extraction failed.";
                await _documents.SaveChangesAsync(ct);
                await _audit.LogAsync("Document.Extraction", document.UserId, "Document", document.Id.ToString(), document.FailureReason, false, ct);
                // A failed extraction is a normal, expected outcome the caller needs to
                // display (not an HTTP-level error) - so this is still Result.Success,
                // just carrying a DTO whose Status/FailureReason say what happened.
                return Result<DocumentSummaryDto>.Success(ToSummaryDto(document));
            }

            int order = 0;
            foreach (var field in aiResult.Fields)
            {
                _documents.AddExtractedField(new ExtractedField
                {
                    DocumentId = document.Id,
                    FieldKey = field.Key,
                    OriginalFieldKey = field.Key,
                    FieldValue = field.Value,
                    OriginalAiValue = field.Value,
                    PageNumber = field.PageNumber,
                    // Fall back to "Generic"/"General" here (not left null) so every newly-
                    // extracted row has a predictable, non-null value downstream - only rows
                    // extracted before this column existed stay genuinely null.
                    SemanticType = string.IsNullOrWhiteSpace(field.SemanticType) ? "Generic" : field.SemanticType,
                    SectionLabel = string.IsNullOrWhiteSpace(field.SectionLabel) ? "General" : field.SectionLabel,
                    SortOrder = order++
                });
            }

            document.Status = DocumentStatus.Extracted;
            await _documents.SaveChangesAsync(ct);

            await _audit.LogAsync("Document.Extraction", document.UserId, "Document", document.Id.ToString(),
                $"{{\"fieldsExtracted\":{aiResult.Fields.Count},\"usedOcr\":{textResult.RequiredOcr}}}", true, ct);

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

    private static DocumentSummaryDto ToSummaryDto(Document document) => new(
        document.Id, document.OriginalFileName, document.PageCount, document.RequiresOcr,
        document.Status.ToString(), document.CreatedAtUtc, document.FailureReason, document.FileSizeBytes,
        document.UploadBatchId);

    /// <summary>
    /// Runs once per bulk upload, after every document in the batch has already been
    /// extracted independently: reconciles field labels across the whole batch (e.g. one
    /// document's "Invoice No" and another's "Invoice Number" become the same canonical
    /// "Invoice Number") so the combined batch view/export puts them in the same column
    /// instead of splitting them into separate ones. A no-op for single-document uploads,
    /// and any failure here (AI call, parsing) just leaves field keys as originally
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

        var mapping = await _aiExtraction.HarmonizeFieldKeysAsync(distinctKeys, ct);
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

    public async Task<Result<ExtractedFieldEditDto>> UpdateFieldAsync(Guid documentId, Guid fieldId, string? newValue, string? newKey = null, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result<ExtractedFieldEditDto>.Failure("Document not found.", "NOT_FOUND");

        var field = document.ExtractedFields.FirstOrDefault(f => f.Id == fieldId);
        if (field is null) return Result<ExtractedFieldEditDto>.Failure("Field not found.", "NOT_FOUND");

        var previousValue = field.FieldValue;
        var previousKey = field.FieldKey;

        field.FieldValue = newValue;
        if (!string.IsNullOrWhiteSpace(newKey))
            field.FieldKey = newKey.Trim();
        // "Edited" means the user actually changed something from what the AI produced -
        // either the value or the label - not just that a save request was sent (the
        // frontend used to mark every field "edited" on blur regardless of any real
        // change, which is exactly the false-positive this recomputation fixes).
        field.WasEditedByUser = field.OriginalAiValue != field.FieldValue || field.OriginalFieldKey != field.FieldKey;

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

    public async Task<Result<byte[]>> ExportToExcelAsync(Guid documentId, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result<byte[]>.Failure("Document not found.", "NOT_FOUND");

        var dto = MapToDetailDto(document);
        var bytes = await _excel.GenerateExcelAsync(dto, ct);

        document.Status = DocumentStatus.Exported;
        await _documents.SaveChangesAsync(ct);

        await _audit.LogAsync("Document.Export", document.UserId, "Document", document.Id.ToString(), null, true, ct);
        return Result<byte[]>.Success(bytes);
    }

    /// <summary>
    /// Several documents at once - the ownership check for each id already happened in
    /// the controller before these tracked entities were fetched, so this trusts the list.
    /// exportMode picks the shape: "SingleSheet" (default - one combined sheet, rows=documents,
    /// columns=field keys), "MultipleSheets" (one .xlsx, one tab per document), or
    /// "SeparateFiles" (a .zip with one standalone .xlsx per document).
    /// </summary>
    public async Task<Result<byte[]>> ExportBatchToExcelAsync(List<Document> documents, string exportMode = "SingleSheet", CancellationToken ct = default)
    {
        if (documents.Count == 0) return Result<byte[]>.Failure("No documents to export.", "NOT_FOUND");

        var dtos = documents.Select(MapToDetailDto).ToList();
        var bytes = exportMode switch
        {
            "MultipleSheets" => await _excel.GenerateMultiSheetExcelAsync(dtos, ct),
            "SeparateFiles" => await _excel.GenerateSeparateFilesZipAsync(dtos, ct),
            _ => await _excel.GenerateBatchExcelAsync(dtos, ct)
        };

        foreach (var document in documents)
            document.Status = DocumentStatus.Exported;
        await _documents.SaveChangesAsync(ct);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchExport", document.UserId, "Document", document.Id.ToString(), $"{{\"exportMode\":\"{exportMode}\"}}", true, ct);

        return Result<byte[]>.Success(bytes);
    }

    public async Task<Result> EmailBatchExportAsync(List<Document> documents, string toAddress, string exportMode = "SingleSheet", CancellationToken ct = default)
    {
        var exportResult = await ExportBatchToExcelAsync(documents, exportMode, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var isZip = exportMode == "SeparateFiles";
        var extension = isZip ? "zip" : "xlsx";
        var attachmentName = $"datamint-batch-export.{extension}";
        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-batch-export-{Guid.NewGuid()}.{extension}");
        await File.WriteAllBytesAsync(tempPath, exportResult.Data!, ct);

        var bodyDescription = exportMode switch
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

        var sent = await _email.SendAsync(
            toAddress,
            $"Your {_appName} extracted data export",
            body,
            tempPath,
            attachmentName,
            ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchEmailSent", document.UserId, "Document", document.Id.ToString(), $"{{\"to\":\"{toAddress}\",\"exportMode\":\"{exportMode}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    public async Task<Result> EmailExportAsync(Guid documentId, string toAddress, CancellationToken ct = default)
    {
        var exportResult = await ExportToExcelAsync(documentId, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-export-{documentId}.xlsx");
        await File.WriteAllBytesAsync(tempPath, exportResult.Data!, ct);

        var body = EmailTemplateHelper.Wrap(
            appName: _appName,
            title: "Your export is ready",
            greeting: "Hi,",
            bodyHtml: $"<p>Please find attached the extracted data exported from {_appName}.</p>");

        var sent = await _email.SendAsync(
            toAddress,
            $"Your {_appName} extracted data export",
            body,
            tempPath,
            "datamint-export.xlsx",
            ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        var document = await _documents.GetByIdAsync(documentId, ct);
        await _audit.LogAsync("Document.EmailSent", document?.UserId, "Document", documentId.ToString(),
            $"{{\"to\":\"{toAddress}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    // Single place pre-existing (pre-migration) null SemanticType/SectionLabel rows fall back to
    // "Generic"/"General" for every reader (frontend grouping, both export formats) - newly
    // extracted rows already have a concrete value baked in by ProcessDocumentAsync's merge loop.
    private static ExtractedFieldEditDto ToEditDto(ExtractedField f) => new(
        f.Id, f.FieldKey, f.OriginalFieldKey, f.FieldValue, f.PageNumber, f.WasEditedByUser,
        string.IsNullOrWhiteSpace(f.SemanticType) ? "Generic" : f.SemanticType,
        string.IsNullOrWhiteSpace(f.SectionLabel) ? "General" : f.SectionLabel,
        f.IncludeInExport, f.SortOrder);

    private static DocumentDetailDto MapToDetailDto(Document document) => new(
        document.Id,
        document.OriginalFileName,
        document.PageCount,
        document.RequiresOcr,
        document.Status.ToString(),
        document.ExtractedFields
            .OrderBy(f => f.SortOrder)
            .Select(ToEditDto)
            .ToList());
}
