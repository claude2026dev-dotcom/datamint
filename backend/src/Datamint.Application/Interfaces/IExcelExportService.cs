using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

public interface IExcelExportService
{
    /// <summary>Builds an .xlsx (one row per key/value, grouped by page) and returns the file bytes.</summary>
    Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, CancellationToken ct = default);

    /// <summary>
    /// Builds one combined .xlsx for multiple documents: one row per document, one
    /// column per distinct field key (first-seen order across all documents) - the
    /// same shape as the combined preview table shown when several files are
    /// uploaded together.
    /// </summary>
    Task<byte[]> GenerateBatchExcelAsync(List<DocumentDetailDto> documents, CancellationToken ct = default);

    /// <summary>Builds one .xlsx with one sheet per document (each sheet shaped like GenerateExcelAsync's single-document layout).</summary>
    Task<byte[]> GenerateMultiSheetExcelAsync(List<DocumentDetailDto> documents, CancellationToken ct = default);

    /// <summary>Builds a .zip containing one standalone .xlsx per document (each named after its source file).</summary>
    Task<byte[]> GenerateSeparateFilesZipAsync(List<DocumentDetailDto> documents, CancellationToken ct = default);
}
