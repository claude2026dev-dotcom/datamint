using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>
/// Reads a PDF (with automatic OCR fallback for scanned/image-only pages) into
/// plain page text. Provider-agnostic — the AI that turns this text into
/// structured fields is a separate concern (see IAiFieldExtractionService),
/// so swapping AI providers never touches PDF/OCR code and vice versa.
/// </summary>
public interface IPdfTextExtractionService
{
    Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default);
}

/// <summary>
/// Turns extracted page text into structured key/value fields using an AI model.
/// Implemented once per provider (Claude, OpenAI, ...); which one is active is a
/// config switch ("AiProvider:Provider" in appsettings) resolved in Program.cs —
/// nothing else in the app needs to know which provider is in use.
/// </summary>
public interface IAiFieldExtractionService
{
    /// <param name="requestedFields">
    /// Null/empty = dynamic mode (AI decides which fields exist). Non-empty = formatted
    /// mode: extract ONLY these exact fields, in this order, null value if not found.
    /// </param>
    Task<AiExtractionResultDto> ExtractStructuredDataAsync(IEnumerable<PdfPageTextDto> pages, IReadOnlyList<string>? requestedFields = null, CancellationToken ct = default);

    /// <summary>
    /// Each document in a bulk upload is extracted independently, so the exact same
    /// real-world field (e.g. an invoice number) can come back worded differently per
    /// document ("Invoice Number" vs "Invoice No" vs "Inv #"). Given every distinct field
    /// label seen across a batch, this asks the AI to recognize which labels mean the same
    /// thing and returns one canonical name per group - every input label maps to a value,
    /// including labels that are already fine as-is (which map to themselves). Returns an
    /// empty dictionary (not an exception) on any failure, so a harmonization hiccup never
    /// blocks the upload it was only meant to polish.
    /// </summary>
    Task<Dictionary<string, string>> HarmonizeFieldKeysAsync(IReadOnlyList<string> distinctKeys, CancellationToken ct = default);
}
