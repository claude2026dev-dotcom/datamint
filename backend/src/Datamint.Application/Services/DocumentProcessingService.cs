using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
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

    // Business rule: 2 free uploads before login is required. Kept as a constant
    // here (not magic-numbered in controllers) so it's one place to change.
    public const int FreeUploadLimit = 2;

    public DocumentProcessingService(
        IDocumentRepository documents,
        IUserRepository users,
        IPdfTextExtractionService textExtraction,
        IAiFieldExtractionService aiExtraction,
        IExcelExportService excel,
        IEmailService email,
        IAuditService audit,
        ILogger<DocumentProcessingService> logger)
    {
        _documents = documents;
        _users = users;
        _textExtraction = textExtraction;
        _aiExtraction = aiExtraction;
        _excel = excel;
        _email = email;
        _audit = audit;
        _logger = logger;
    }

    public async Task<Result<DocumentSummaryDto>> UploadAndQueueAsync(
        Guid? userId, string originalFileName, string storedFilePath, long fileSizeBytes, string? uploaderIp,
        string extractionMode = "Dynamic", string? requestedFields = null, CancellationToken ct = default)
    {
        // Free-tier / plan limit gate is enforced server-side in DocumentsController
        // before this method is called (anonymous: by IP, logged-in: by subscription).
        if (userId is not null)
        {
            var user = await _users.GetByIdAsync(userId.Value, ct);
            if (user is null)
                return Result<DocumentSummaryDto>.Failure("User not found.", "USER_NOT_FOUND");
        }

        var document = new Document
        {
            UserId = userId,
            OriginalFileName = originalFileName,
            StoredFilePath = storedFilePath,
            FileSizeBytes = fileSizeBytes,
            UploaderIpAddress = userId is null ? uploaderIp : null,
            Status = DocumentStatus.Uploaded,
            ExtractionMode = extractionMode == "Formatted" ? "Formatted" : "Dynamic",
            RequestedFields = extractionMode == "Formatted" ? requestedFields : null
        };

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
    public async Task<Result<DocumentSummaryDto>> ProcessDocumentAsync(Guid documentId, CancellationToken ct = default)
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

            var textResult = await _textExtraction.ExtractTextAsync(document.StoredFilePath, ct);
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
        document.Status.ToString(), document.CreatedAtUtc, document.FailureReason);

    public async Task<Result> UpdateFieldAsync(Guid documentId, Guid fieldId, string? newValue, string? newKey = null, CancellationToken ct = default)
    {
        var document = await _documents.GetWithDetailsAsync(documentId, ct);
        if (document is null) return Result.Failure("Document not found.", "NOT_FOUND");

        var field = document.ExtractedFields.FirstOrDefault(f => f.Id == fieldId);
        if (field is null) return Result.Failure("Field not found.", "NOT_FOUND");

        field.FieldValue = newValue;
        field.WasEditedByUser = field.OriginalAiValue != newValue;
        if (!string.IsNullOrWhiteSpace(newKey))
            field.FieldKey = newKey.Trim();

        await _documents.SaveChangesAsync(ct);
        return Result.Success();
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
    /// One combined workbook for several documents at once (rows=documents,
    /// columns=field keys) - the ownership check for each id already happened in
    /// the controller before these tracked entities were fetched, so this trusts the list.
    /// </summary>
    public async Task<Result<byte[]>> ExportBatchToExcelAsync(List<Document> documents, CancellationToken ct = default)
    {
        if (documents.Count == 0) return Result<byte[]>.Failure("No documents to export.", "NOT_FOUND");

        var dtos = documents.Select(MapToDetailDto).ToList();
        var bytes = await _excel.GenerateBatchExcelAsync(dtos, ct);

        foreach (var document in documents)
            document.Status = DocumentStatus.Exported;
        await _documents.SaveChangesAsync(ct);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchExport", document.UserId, "Document", document.Id.ToString(), null, true, ct);

        return Result<byte[]>.Success(bytes);
    }

    public async Task<Result> EmailBatchExportAsync(List<Document> documents, string toAddress, CancellationToken ct = default)
    {
        var exportResult = await ExportBatchToExcelAsync(documents, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-batch-export-{Guid.NewGuid()}.xlsx");
        await File.WriteAllBytesAsync(tempPath, exportResult.Data!, ct);

        var sent = await _email.SendAsync(
            toAddress,
            "Your Datamint extracted data export",
            $"<p>Hi,</p><p>Please find attached the combined extracted data for {documents.Count} document(s) from Datamint.</p><p>— Datamint</p>",
            tempPath,
            "datamint-batch-export.xlsx",
            ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        foreach (var document in documents)
            await _audit.LogAsync("Document.BatchEmailSent", document.UserId, "Document", document.Id.ToString(), $"{{\"to\":\"{toAddress}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    public async Task<Result> EmailExportAsync(Guid documentId, string toAddress, CancellationToken ct = default)
    {
        var exportResult = await ExportToExcelAsync(documentId, ct);
        if (!exportResult.Succeeded) return Result.Failure(exportResult.Error!, exportResult.ErrorCode!);

        var tempPath = Path.Combine(Path.GetTempPath(), $"datamint-export-{documentId}.xlsx");
        await File.WriteAllBytesAsync(tempPath, exportResult.Data!, ct);

        var sent = await _email.SendAsync(
            toAddress,
            "Your Datamint extracted data export",
            "<p>Hi,</p><p>Please find attached the extracted data exported from Datamint.</p><p>— Datamint</p>",
            tempPath,
            "datamint-export.xlsx",
            ct);

        if (File.Exists(tempPath)) File.Delete(tempPath);

        var document = await _documents.GetByIdAsync(documentId, ct);
        await _audit.LogAsync("Document.EmailSent", document?.UserId, "Document", documentId.ToString(),
            $"{{\"to\":\"{toAddress}\"}}", sent, ct);

        return sent ? Result.Success() : Result.Failure("Failed to send email. Please check email service configuration.", "EMAIL_FAILED");
    }

    private static DocumentDetailDto MapToDetailDto(Document document) => new(
        document.Id,
        document.OriginalFileName,
        document.PageCount,
        document.RequiresOcr,
        document.Status.ToString(),
        document.ExtractedFields
            .OrderBy(f => f.SortOrder)
            .Select(f => new ExtractedFieldEditDto(f.Id, f.FieldKey, f.OriginalFieldKey, f.FieldValue, f.PageNumber, f.WasEditedByUser))
            .ToList());
}
