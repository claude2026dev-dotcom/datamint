using System.IO.Compression;
using ClosedXML.Excel;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;

namespace Datamint.Infrastructure.Services;

/// <summary>Builds a clean .xlsx from the (possibly user-edited) extracted fields, in either
/// a rows-per-field or columns-per-field layout, respecting per-field/per-document export
/// selection.</summary>
public class ExcelExportService : IExcelExportService
{
    private static readonly XLColor HeaderFill = XLColor.FromHtml("#4F46E5");
    private static readonly XLColor SectionFill = XLColor.FromHtml("#E5E7FF");

    /// <summary>Same include-filter every export path applies: an explicit includedFieldIds
    /// override wins if given, otherwise each field's own saved IncludeInExport flag decides.</summary>
    private static List<ExtractedField> FilterFields(List<ExtractedField> fields, List<Guid>? includedFieldIds) =>
        (includedFieldIds is { Count: > 0 } ids
            ? fields.Where(f => ids.Contains(f.Id))
            : fields.Where(f => f.IncludeInExport))
        .ToList();

    /// <summary>Writes one document's rows-per-field block starting at <paramref name="startRow"/>,
    /// returning the next free row. <paramref name="includeDocHeader"/> adds a bold file-name row
    /// above the column header - used when several documents share one sheet (batch SingleSheet
    /// + RowsPerField) so each document's block is still identifiable; omitted for the plain
    /// single-document sheet, which needs no such label.</summary>
    private static int WriteRowsPerFieldBlock(IXLWorksheet sheet, string fileName, List<ExtractedField> fields, List<Guid>? includedFieldIds, int startRow, bool includeDocHeader)
    {
        int row = startRow;
        if (includeDocHeader)
        {
            sheet.Cell(row, 1).Value = fileName;
            var docHeader = sheet.Range(row, 1, row, 6);
            docHeader.Merge();
            docHeader.Style.Font.Bold = true;
            docHeader.Style.Font.FontSize = 12;
            row++;
        }

        sheet.Cell(row, 1).Value = "Page";
        sheet.Cell(row, 2).Value = "Original Field Label";
        sheet.Cell(row, 3).Value = "Field Name";
        sheet.Cell(row, 4).Value = "Value";
        sheet.Cell(row, 5).Value = "Type";
        sheet.Cell(row, 6).Value = "Edited?";
        var header = sheet.Range(row, 1, row, 6);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = HeaderFill;
        header.Style.Font.FontColor = XLColor.White;
        row++;

        var filtered = FilterFields(fields, includedFieldIds).OrderBy(f => f.SortOrder).ToList();

        string? currentSection = null;
        foreach (var field in filtered)
        {
            if (field.SectionLabel != currentSection)
            {
                currentSection = field.SectionLabel;
                sheet.Cell(row, 1).Value = currentSection ?? "General";
                var sectionRow = sheet.Range(row, 1, row, 6);
                sectionRow.Merge();
                sectionRow.Style.Font.Bold = true;
                sectionRow.Style.Fill.BackgroundColor = SectionFill;
                row++;
            }

            sheet.Cell(row, 1).Value = field.PageNumber?.ToString() ?? "-";
            sheet.Cell(row, 2).Value = field.OriginalFieldKey;
            sheet.Cell(row, 3).Value = field.FieldKey;
            sheet.Cell(row, 4).Value = field.FieldValue ?? "";
            sheet.Cell(row, 5).Value = field.SemanticType;
            sheet.Cell(row, 6).Value = field.WasEditedByUser ? "Yes" : "No";
            row++;
        }

        if (includeDocHeader) row++; // blank separator row between document blocks
        return row;
    }

    private static void WriteRowsPerFieldSheet(IXLWorksheet sheet, string fileName, List<ExtractedField> fields, List<Guid>? includedFieldIds)
    {
        WriteRowsPerFieldBlock(sheet, fileName, fields, includedFieldIds, 1, includeDocHeader: false);
        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
    }

    /// <summary>Several documents' rows-per-field blocks stacked in one sheet - the RowsPerField
    /// counterpart to <see cref="WriteColumnsPerFieldSheet"/> for batch SingleSheet mode.</summary>
    private static void WriteRowsPerFieldBatchSheet(IXLWorksheet sheet, List<(string FileName, List<ExtractedField> Fields)> documents)
    {
        int row = 1;
        foreach (var (fileName, fields) in documents)
            row = WriteRowsPerFieldBlock(sheet, fileName, fields, null, row, includeDocHeader: true);

        sheet.Columns().AdjustToContents();
    }

    /// <summary>One column per field key, one row per document - used for a single document's
    /// ColumnsPerField layout (one row total) and for the batch SingleSheet mode (one row per
    /// document), which is really the same shape at a document-count of one vs many. Each field
    /// gets a paired "Edited?" column right after its value column, matching the same Yes/No
    /// convention the RowsPerField layout already uses.</summary>
    private static void WriteColumnsPerFieldSheet(IXLWorksheet sheet, List<(string FileName, List<ExtractedField> Fields)> documents)
    {
        var filteredPerDoc = documents.Select(d => (d.FileName, Fields: FilterFields(d.Fields, null))).ToList();

        // Match columns across documents by FieldKey (the current, editable display name)
        // rather than the immutable OriginalFieldKey - AI batch harmonization (and manual
        // renames) land on FieldKey, so matching there is what actually puts equivalent fields
        // in the same column.
        var fieldKeysInOrder = new List<string>();
        foreach (var (_, fields) in filteredPerDoc)
            foreach (var field in fields)
                if (!fieldKeysInOrder.Contains(field.FieldKey))
                    fieldKeysInOrder.Add(field.FieldKey);

        // Two columns per field: the value, then a companion "Edited?" Yes/No column.
        int ValueCol(int fieldIndex) => 2 + fieldIndex * 2;
        int EditedCol(int fieldIndex) => ValueCol(fieldIndex) + 1;

        sheet.Cell(1, 1).Value = "File Name";
        for (int c = 0; c < fieldKeysInOrder.Count; c++)
        {
            sheet.Cell(1, ValueCol(c)).Value = fieldKeysInOrder[c];
            sheet.Cell(1, EditedCol(c)).Value = $"{fieldKeysInOrder[c]} (Edited?)";
        }

        var lastCol = fieldKeysInOrder.Count > 0 ? EditedCol(fieldKeysInOrder.Count - 1) : 1;
        var header = sheet.Range(1, 1, 1, lastCol);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = HeaderFill;
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var (fileName, fields) in filteredPerDoc)
        {
            sheet.Cell(row, 1).Value = fileName;
            foreach (var field in fields)
            {
                var fieldIndex = fieldKeysInOrder.IndexOf(field.FieldKey);
                sheet.Cell(row, ValueCol(fieldIndex)).Value = field.FieldValue ?? "";
                sheet.Cell(row, EditedCol(fieldIndex)).Value = field.WasEditedByUser ? "Yes" : "No";
            }
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
        sheet.SheetView.FreezeColumns(1);
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

    public ExportResultDto ExportSingle(string fileName, List<ExtractedField> fields, ExportLayout layout, List<Guid>? includedFieldIds)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");
        if (layout == ExportLayout.ColumnsPerField)
            WriteColumnsPerFieldSheet(sheet, [(fileName, fields)]);
        else
            WriteRowsPerFieldSheet(sheet, fileName, fields, includedFieldIds);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return new ExportResultDto(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{Path.GetFileNameWithoutExtension(fileName)}.xlsx");
    }

    public ExportResultDto ExportBatchSingleSheet(List<(string FileName, List<ExtractedField> Fields)> documents, ExportLayout layout)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");
        if (layout == ExportLayout.RowsPerField)
            WriteRowsPerFieldBatchSheet(sheet, documents);
        else
            WriteColumnsPerFieldSheet(sheet, documents);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return new ExportResultDto(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "extracted-data.xlsx");
    }

    public ExportResultDto ExportBatchMultipleSheets(List<(string FileName, List<ExtractedField> Fields)> documents, ExportLayout layout)
    {
        using var workbook = new XLWorkbook();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (fileName, fields) in documents)
        {
            var sheet = workbook.Worksheets.Add(SafeSheetName(fileName, usedNames));
            if (layout == ExportLayout.ColumnsPerField)
                WriteColumnsPerFieldSheet(sheet, [(fileName, fields)]);
            else
                WriteRowsPerFieldSheet(sheet, fileName, fields, null);
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return new ExportResultDto(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "extracted-data.xlsx");
    }

    public ExportResultDto ExportBatchSeparateFiles(List<(string FileName, List<ExtractedField> Fields)> documents, ExportLayout layout)
    {
        using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var (fileName, fields) in documents)
            {
                using var workbook = new XLWorkbook();
                var sheet = workbook.Worksheets.Add("Extracted Data");
                if (layout == ExportLayout.ColumnsPerField)
                    WriteColumnsPerFieldSheet(sheet, [(fileName, fields)]);
                else
                    WriteRowsPerFieldSheet(sheet, fileName, fields, null);

                var entryName = $"{SafeSheetName(fileName, usedNames)}.xlsx";
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var docStream = new MemoryStream();
                workbook.SaveAs(docStream);
                docStream.Position = 0;
                docStream.CopyTo(entryStream);
            }
        }

        return new ExportResultDto(zipStream.ToArray(), "application/zip", "extracted-data.zip");
    }
}
