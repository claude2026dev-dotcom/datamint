using System.IO.Compression;
using ClosedXML.Excel;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

/// <summary>Builds a clean, grouped-by-page .xlsx from the (possibly user-edited) extracted fields.</summary>
public class ExcelExportService : IExcelExportService
{
    private static void WriteSingleDocumentSheet(IXLWorksheet sheet, DocumentDetailDto document)
    {
        sheet.Cell(1, 1).Value = "Page";
        sheet.Cell(1, 2).Value = "Original Field Label";
        sheet.Cell(1, 3).Value = "Field Name";
        sheet.Cell(1, 4).Value = "Value";
        sheet.Cell(1, 5).Value = "Edited?";
        var header = sheet.Range(1, 1, 1, 5);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#4F46E5");
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var field in document.Fields.OrderBy(f => f.PageNumber ?? 0))
        {
            sheet.Cell(row, 1).Value = field.PageNumber?.ToString() ?? "-";
            sheet.Cell(row, 2).Value = field.OriginalFieldKey;
            sheet.Cell(row, 3).Value = field.FieldKey;
            sheet.Cell(row, 4).Value = field.FieldValue ?? "";
            sheet.Cell(row, 5).Value = field.WasEditedByUser ? "Yes" : "No";
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
    }

    /// <summary>Excel sheet names can't exceed 31 chars or contain \/*?:[] - and two
    /// documents can share a file name - so names are sanitized and de-duplicated
    /// with a numeric suffix rather than letting ClosedXML throw on a collision.</summary>
    private static string SafeSheetName(string fileName, HashSet<string> usedNames)
    {
        var baseName = System.Text.RegularExpressions.Regex.Replace(
            Path.GetFileNameWithoutExtension(fileName), @"[\\/*?:\[\]]", "_");
        if (baseName.Length > 28) baseName = baseName[..28];
        if (string.IsNullOrWhiteSpace(baseName)) baseName = "Sheet";

        var candidate = baseName;
        var suffix = 2;
        while (!usedNames.Add(candidate))
            candidate = $"{baseName} ({suffix++})";
        return candidate;
    }

    public Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");
        WriteSingleDocumentSheet(sheet, document);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }

    public Task<byte[]> GenerateBatchExcelAsync(List<DocumentDetailDto> documents, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");

        // Match columns across documents by FieldKey (the current, editable display
        // name) rather than the immutable OriginalFieldKey. For a bulk upload, the AI
        // harmonization pass (DocumentProcessingService.HarmonizeBatchFieldKeysAsync)
        // already reconciled equivalent labels - e.g. one document's "Invoice No" and
        // another's "Invoice Number" both become "Invoice Number" - onto FieldKey, so
        // matching on it here is what actually puts them in the same column. It also
        // means a user manually renaming a field to match another document's label
        // merges them too, not just the AI's own harmonization.
        var fieldKeysInOrder = new List<string>();
        foreach (var doc in documents)
        {
            foreach (var field in doc.Fields)
            {
                if (!fieldKeysInOrder.Contains(field.FieldKey))
                    fieldKeysInOrder.Add(field.FieldKey);
            }
        }

        sheet.Cell(1, 1).Value = "File Name";
        for (int c = 0; c < fieldKeysInOrder.Count; c++)
            sheet.Cell(1, c + 2).Value = fieldKeysInOrder[c];

        var header = sheet.Range(1, 1, 1, fieldKeysInOrder.Count + 1);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#4F46E5");
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var doc in documents)
        {
            sheet.Cell(row, 1).Value = doc.OriginalFileName;
            foreach (var field in doc.Fields)
            {
                var colIndex = fieldKeysInOrder.IndexOf(field.FieldKey) + 2;
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

    public Task<byte[]> GenerateMultiSheetExcelAsync(List<DocumentDetailDto> documents, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var doc in documents)
        {
            var sheet = workbook.Worksheets.Add(SafeSheetName(doc.OriginalFileName, usedNames));
            WriteSingleDocumentSheet(sheet, doc);
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }

    public Task<byte[]> GenerateSeparateFilesZipAsync(List<DocumentDetailDto> documents, CancellationToken ct = default)
    {
        using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var doc in documents)
            {
                using var workbook = new XLWorkbook();
                var sheet = workbook.Worksheets.Add("Extracted Data");
                WriteSingleDocumentSheet(sheet, doc);

                var entryName = $"{SafeSheetName(doc.OriginalFileName, usedNames)}.xlsx";
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var docStream = new MemoryStream();
                workbook.SaveAs(docStream);
                docStream.Position = 0;
                docStream.CopyTo(entryStream);
            }
        }

        return Task.FromResult(zipStream.ToArray());
    }
}
