using ClosedXML.Excel;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

/// <summary>Builds a clean, grouped-by-page .xlsx from the (possibly user-edited) extracted fields.</summary>
public class ExcelExportService : IExcelExportService
{
    public Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");

        sheet.Cell(1, 1).Value = "Page";
        sheet.Cell(1, 2).Value = "Field";
        sheet.Cell(1, 3).Value = "Value";
        sheet.Cell(1, 4).Value = "Edited?";
        var header = sheet.Range(1, 1, 1, 4);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#4F46E5");
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var field in document.Fields.OrderBy(f => f.PageNumber ?? 0))
        {
            sheet.Cell(row, 1).Value = field.PageNumber?.ToString() ?? "-";
            sheet.Cell(row, 2).Value = field.FieldKey;
            sheet.Cell(row, 3).Value = field.FieldValue ?? "";
            sheet.Cell(row, 4).Value = field.WasEditedByUser ? "Yes" : "No";
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }
}
