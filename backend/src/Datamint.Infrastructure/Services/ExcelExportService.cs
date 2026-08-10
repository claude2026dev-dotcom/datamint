using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;

namespace Datamint.Infrastructure.Services;

/// <summary>Builds a clean .xlsx from the (possibly user-edited) extracted fields, in either
/// a rows-per-field or columns-per-field layout, respecting per-field/per-document export
/// selection. Deliberately shows only field/value (plus page and type for context) - edit
/// history and the AI's original values are a review-page-only concept (see the on-screen
/// "Edit" tab), never written into the exported file itself.</summary>
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

    /// <summary>
    /// Writes a field's value into a cell using a real Excel type where the field's SemanticType
    /// makes that meaningful (Currency/Number/Percentage as numbers, Date as a real date, Boolean
    /// as true/false) instead of always writing plain text - so the exported sheet can actually
    /// be summed, sorted, or filtered like real spreadsheet data. "Text" stays plain text on
    /// purpose - names, addresses, reference/ID numbers, phone numbers, emails, and URLs would
    /// have leading zeros, "+" prefixes, or other non-numeric characters silently corrupted by
    /// numeric coercion. Any value that fails to parse for its declared type falls back to plain
    /// text rather than dropping or corrupting it - never let a formatting nicety lose real data.
    /// </summary>
    private static void SetTypedValue(IXLCell cell, string? rawValue, string? semanticType)
    {
        if (string.IsNullOrWhiteSpace(rawValue)) { cell.Value = string.Empty; return; }

        switch (semanticType)
        {
            case "Currency":
                if (TryParseNumber(rawValue, out var amount))
                {
                    cell.Value = amount;
                    cell.Style.NumberFormat.Format = "#,##0.00;(#,##0.00)";
                    return;
                }
                break;

            case "Number":
                if (TryParseNumber(rawValue, out var qty))
                {
                    cell.Value = qty;
                    cell.Style.NumberFormat.Format = "#,##0.##";
                    return;
                }
                break;

            case "Percentage":
                if (TryParseNumber(rawValue.Replace("%", ""), out var pct))
                {
                    cell.Value = pct / 100m;
                    cell.Style.NumberFormat.Format = "0.00%";
                    return;
                }
                break;

            case "Date":
                if (TryParseDate(rawValue, out var date))
                {
                    cell.Value = date;
                    cell.Style.NumberFormat.Format = "dd-mmm-yyyy";
                    return;
                }
                break;

            case "Boolean":
                switch (rawValue.Trim().ToLowerInvariant())
                {
                    case "yes": case "y": case "true": cell.Value = true; return;
                    case "no": case "n": case "false": cell.Value = false; return;
                }
                break;
        }

        // "Text", or a value that didn't actually match its declared type (e.g. "N/A" on a
        // Currency field) - keep it as-is, verbatim.
        cell.Value = rawValue;
    }

    /// <summary>Strips currency symbols, thousands separators (including Indian lakh/crore
    /// grouping like "5,00,000", which .NET's culture-based parsing doesn't recognize), and
    /// treats accounting-style parentheses as negative, before parsing.</summary>
    private static bool TryParseNumber(string raw, out decimal value)
    {
        var cleaned = raw.Trim();
        var negative = false;
        if (cleaned.StartsWith('(') && cleaned.EndsWith(')'))
        {
            negative = true;
            cleaned = cleaned[1..^1];
        }
        cleaned = Regex.Replace(cleaned, @"[^\d.\-]", "");

        if (decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out value))
        {
            if (negative) value = -value;
            return true;
        }
        value = 0;
        return false;
    }

    private static readonly string[] DateFormats =
    [
        "d MMMM yyyy", "dd MMMM yyyy", "d MMM yyyy", "dd MMM yyyy",
        "yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy", "dd-MM-yyyy", "dd.MM.yyyy"
    ];

    private static bool TryParseDate(string raw, out DateTime value)
    {
        var trimmed = raw.Trim();
        if (DateTime.TryParseExact(trimmed, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out value))
            return true;
        return DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }

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
            var docHeader = sheet.Range(row, 1, row, 4);
            docHeader.Merge();
            docHeader.Style.Font.Bold = true;
            docHeader.Style.Font.FontSize = 12;
            row++;
        }

        sheet.Cell(row, 1).Value = "Page";
        sheet.Cell(row, 2).Value = "Field Name";
        sheet.Cell(row, 3).Value = "Value";
        sheet.Cell(row, 4).Value = "Type";
        var header = sheet.Range(row, 1, row, 4);
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
                var sectionRow = sheet.Range(row, 1, row, 4);
                sectionRow.Merge();
                sectionRow.Style.Font.Bold = true;
                sectionRow.Style.Fill.BackgroundColor = SectionFill;
                row++;
            }

            sheet.Cell(row, 1).Value = field.PageNumber?.ToString() ?? "-";
            sheet.Cell(row, 2).Value = field.FieldKey;
            SetTypedValue(sheet.Cell(row, 3), field.FieldValue, field.SemanticType);
            sheet.Cell(row, 4).Value = string.IsNullOrWhiteSpace(field.SemanticType) ? "Text" : field.SemanticType;
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
    /// document), which is really the same shape at a document-count of one vs many.
    ///
    /// Deliberately just field/value: no "Edited?" column, no original-label/original-value
    /// comments - that comparison lives only in the on-screen review grid's Edit tab, so the
    /// exported file itself stays a clean, professional data sheet. Fields are grouped under
    /// their section name via a merged band row above the field-name header row, the same
    /// grouping the on-screen review grid shows.</summary>
    private static void WriteColumnsPerFieldSheet(IXLWorksheet sheet, List<(string FileName, List<ExtractedField> Fields)> documents)
    {
        var filteredPerDoc = documents.Select(d => (d.FileName, Fields: FilterFields(d.Fields, null))).ToList();

        // Match columns across documents by FieldKey (the current, editable display name)
        // rather than the immutable OriginalFieldKey - AI batch harmonization (and manual
        // renames) land on FieldKey, so matching there is what actually puts equivalent fields
        // in the same column. Each column also remembers which section it belongs to (the first
        // one seen).
        var fieldKeysInOrder = new List<string>();
        var sectionByKey = new Dictionary<string, string>();
        var semanticTypeByKey = new Dictionary<string, string>();
        foreach (var (_, fields) in filteredPerDoc)
        {
            foreach (var field in fields)
            {
                if (!fieldKeysInOrder.Contains(field.FieldKey))
                {
                    fieldKeysInOrder.Add(field.FieldKey);
                    sectionByKey[field.FieldKey] = string.IsNullOrWhiteSpace(field.SectionLabel) ? "General" : field.SectionLabel;
                    semanticTypeByKey[field.FieldKey] = string.IsNullOrWhiteSpace(field.SemanticType) ? "Text" : field.SemanticType;
                }
            }
        }

        const int FirstFieldCol = 2;
        sheet.Cell(1, 1).Value = "Document";
        sheet.Range(1, 1, 2, 1).Merge();

        // Section band row: one merged, colored cell per contiguous run of columns sharing a
        // section - built by walking fieldKeysInOrder and grouping equal-section runs, so a
        // section that (rarely) isn't contiguous still renders as separate correctly-labeled
        // bands rather than silently merging into its neighbor.
        var col = FirstFieldCol;
        var i = 0;
        while (i < fieldKeysInOrder.Count)
        {
            var section = sectionByKey[fieldKeysInOrder[i]];
            var runLength = 1;
            while (i + runLength < fieldKeysInOrder.Count && sectionByKey[fieldKeysInOrder[i + runLength]] == section)
                runLength++;

            var band = sheet.Range(1, col, 1, col + runLength - 1);
            if (runLength > 1) band.Merge();
            band.Value = section;
            band.Style.Font.Bold = true;
            band.Style.Fill.BackgroundColor = SectionFill;
            band.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            col += runLength;
            i += runLength;
        }

        for (int c = 0; c < fieldKeysInOrder.Count; c++)
            sheet.Cell(2, FirstFieldCol + c).Value = fieldKeysInOrder[c];

        var lastCol = fieldKeysInOrder.Count > 0 ? FirstFieldCol + fieldKeysInOrder.Count - 1 : FirstFieldCol;
        var fieldHeaderRow = sheet.Range(2, FirstFieldCol, 2, lastCol);
        fieldHeaderRow.Style.Font.Bold = true;
        fieldHeaderRow.Style.Fill.BackgroundColor = HeaderFill;
        fieldHeaderRow.Style.Font.FontColor = XLColor.White;
        sheet.Cell(2, 1).Style.Font.Bold = true;
        sheet.Cell(2, 1).Style.Fill.BackgroundColor = HeaderFill;
        sheet.Cell(2, 1).Style.Font.FontColor = XLColor.White;

        int row = 3;
        foreach (var (fileName, fields) in filteredPerDoc)
        {
            sheet.Cell(row, 1).Value = fileName;
            foreach (var field in fields)
            {
                var fieldIndex = fieldKeysInOrder.IndexOf(field.FieldKey);
                var cell = sheet.Cell(row, FirstFieldCol + fieldIndex);
                SetTypedValue(cell, field.FieldValue, field.SemanticType);
            }
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(2);
        sheet.SheetView.FreezeColumns(1);
    }

    /// <summary>Excel sheet names can't exceed 31 chars or contain \/*?:[] - and two
    /// documents can share a file name - so names are sanitized and de-duplicated
    /// with a numeric suffix rather than letting ClosedXML throw on a collision.</summary>
    private static string SafeSheetName(string fileName, HashSet<string> usedNames)
    {
        var baseName = Regex.Replace(Path.GetFileNameWithoutExtension(fileName), @"[\\/*?:\[\]]", "_");
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
