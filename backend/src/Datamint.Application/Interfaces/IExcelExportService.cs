using Datamint.Application.DTOs;

namespace Datamint.Application.Interfaces;

public interface IExcelExportService
{
    /// <summary>Builds an .xlsx (one row per key/value, grouped by page) and returns the file bytes.</summary>
    Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, CancellationToken ct = default);
}
