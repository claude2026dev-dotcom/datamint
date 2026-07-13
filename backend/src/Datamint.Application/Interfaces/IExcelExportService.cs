using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

public interface IExcelExportService
{
    /// <summary>Builds an .xlsx for one document. Layout picks rows-per-field (grouped by
    /// section, one field per row) or columns-per-field (one row, one column per field key).</summary>
    Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, ExportOptionsDto options, CancellationToken ct = default);

    /// <summary>
    /// Builds one combined .xlsx for multiple documents: one row per document, one
    /// column per distinct field key (first-seen order across all documents) - the
    /// same shape as the combined preview table shown when several files are
    /// uploaded together. (Layout is always columns-per-field here regardless of
    /// options.Layout - "SingleSheet" only makes sense transposed.)
    /// </summary>
    Task<byte[]> GenerateBatchExcelAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default);

    /// <summary>Builds one .xlsx with one sheet per document, each sheet using the requested layout.</summary>
    Task<byte[]> GenerateMultiSheetExcelAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default);

    /// <summary>Builds a .zip containing one standalone .xlsx per document, each using the requested layout.</summary>
    Task<byte[]> GenerateSeparateFilesZipAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default);
}
