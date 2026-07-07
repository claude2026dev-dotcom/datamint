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

    public Task<byte[]> GenerateBatchExcelAsync(List<DocumentDetailDto> documents, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");

        // First-seen order across all documents becomes the column order - for
        // Formatted-mode uploads every document has the same fields in the same
        // order already, so this naturally matches the requested field list.
        var columns = new List<string>();
        foreach (var doc in documents)
            foreach (var field in doc.Fields)
                if (!columns.Contains(field.FieldKey)) columns.Add(field.FieldKey);

        sheet.Cell(1, 1).Value = "File Name";
        for (int c = 0; c < columns.Count; c++)
            sheet.Cell(1, c + 2).Value = columns[c];

        var header = sheet.Range(1, 1, 1, columns.Count + 1);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#4F46E5");
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var doc in documents)
        {
            sheet.Cell(row, 1).Value = doc.OriginalFileName;
            foreach (var field in doc.Fields)
            {
                var colIndex = columns.IndexOf(field.FieldKey) + 2;
                sheet.Cell(row, colIndex).Value = field.FieldValue ?? "";
            }
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
        sheet.SheetView.FreezeColumns(1);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }
}
