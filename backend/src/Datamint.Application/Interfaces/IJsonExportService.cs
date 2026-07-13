using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

/// <summary>Builds a JSON export mirroring each document's section/field grouping - the
/// alternative to IExcelExportService's flat, spreadsheet-oriented output.</summary>
public interface IJsonExportService
{
    Task<byte[]> GenerateDocumentJsonAsync(DocumentDetailDto document, ExportOptionsDto options, CancellationToken ct = default);
    Task<byte[]> GenerateBatchJsonAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default);
}
