using System.IO.Compression;
using ClosedXML.Excel;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

/// <summary>Builds a clean .xlsx from the (possibly user-edited) extracted fields, in either
/// a rows-per-field or columns-per-field layout, respecting per-field/per-document export
/// selection.</summary>
public class ExcelExportService : IExcelExportService
{
    private static readonly XLColor HeaderFill = XLColor.FromHtml("#4F46E5");
    private static readonly XLColor SectionFill = XLColor.FromHtml("#E5E7FF");

    /// <summary>Same include-filter every export path applies: an explicit IncludedFieldIds
    /// override wins if given, otherwise each field's own saved IncludeInExport flag decides.</summary>
    private static List<ExtractedFieldEditDto> FilterFields(DocumentDetailDto document, ExportOptionsDto options) =>
        (options.IncludedFieldIds is { Count: > 0 } ids
            ? document.Fields.Where(f => ids.Contains(f.Id))
            : document.Fields.Where(f => f.IncludeInExport))
        .ToList();

    /// <summary>Writes one document's rows-per-field block starting at <paramref name="startRow"/>,
    /// returning the next free row. <paramref name="includeDocHeader"/> adds a bold file-name row
    /// above the column header - used when several documents share one sheet (batch SingleSheet
    /// + RowsPerField) so each document's block is still identifiable; omitted for the plain
    /// single-document sheet, which needs no such label.</summary>
    private static int WriteRowsPerFieldBlock(IXLWorksheet sheet, DocumentDetailDto document, ExportOptionsDto options, int startRow, bool includeDocHeader)
    {
        int row = startRow;
        if (includeDocHeader)
        {
            sheet.Cell(row, 1).Value = document.OriginalFileName;
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

        var fields = FilterFields(document, options).OrderBy(f => f.SortOrder).ToList();

        string? currentSection = null;
        foreach (var field in fields)
        {
            if (field.SectionLabel != currentSection)
            {
                currentSection = field.SectionLabel;
                sheet.Cell(row, 1).Value = currentSection;
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

    private static void WriteRowsPerFieldSheet(IXLWorksheet sheet, DocumentDetailDto document, ExportOptionsDto options)
    {
        WriteRowsPerFieldBlock(sheet, document, options, 1, includeDocHeader: false);
        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
    }

    /// <summary>Several documents' rows-per-field blocks stacked in one sheet - the RowsPerField
    /// counterpart to <see cref="WriteColumnsPerFieldSheet"/> for batch SingleSheet mode.</summary>
    private static void WriteRowsPerFieldBatchSheet(IXLWorksheet sheet, List<DocumentDetailDto> documents, ExportOptionsDto options)
    {
        int row = 1;
        foreach (var doc in documents)
            row = WriteRowsPerFieldBlock(sheet, doc, options, row, includeDocHeader: true);

        sheet.Columns().AdjustToContents();
    }

    /// <summary>One column per field key, one row per document - used for a single document's
    /// ColumnsPerField layout (one row total) and for the batch SingleSheet mode (one row per
    /// document), which is really the same shape at a document-count of one vs many.</summary>
    private static void WriteColumnsPerFieldSheet(IXLWorksheet sheet, List<DocumentDetailDto> documents, ExportOptionsDto options)
    {
        var filteredPerDoc = documents.ToDictionary(d => d.Id, d => FilterFields(d, options));

        // Match columns across documents by FieldKey (the current, editable display name)
        // rather than the immutable OriginalFieldKey - see GenerateBatchExcelAsync's original
        // rationale: AI batch harmonization (and manual renames) land on FieldKey, so matching
        // there is what actually puts equivalent fields in the same column.
        var fieldKeysInOrder = new List<string>();
        foreach (var fields in filteredPerDoc.Values)
            foreach (var field in fields)
                if (!fieldKeysInOrder.Contains(field.FieldKey))
                    fieldKeysInOrder.Add(field.FieldKey);

        sheet.Cell(1, 1).Value = "File Name";
        for (int c = 0; c < fieldKeysInOrder.Count; c++)
            sheet.Cell(1, c + 2).Value = fieldKeysInOrder[c];

        var header = sheet.Range(1, 1, 1, Math.Max(1, fieldKeysInOrder.Count) + 1);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = HeaderFill;
        header.Style.Font.FontColor = XLColor.White;

        int row = 2;
        foreach (var doc in documents)
        {
            sheet.Cell(row, 1).Value = doc.OriginalFileName;
            foreach (var field in filteredPerDoc[doc.Id])
            {
                var colIndex = fieldKeysInOrder.IndexOf(field.FieldKey) + 2;
                sheet.Cell(row, colIndex).Value = field.FieldValue ?? "";
            }
            row++;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
        sheet.SheetView.FreezeColumns(1);
    }

    private static void WriteSheet(IXLWorksheet sheet, DocumentDetailDto document, ExportOptionsDto options)
    {
        if (options.Layout == ExportLayout.ColumnsPerField)
            WriteColumnsPerFieldSheet(sheet, [document], options);
        else
            WriteRowsPerFieldSheet(sheet, document, options);
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

    public Task<byte[]> GenerateExcelAsync(DocumentDetailDto document, ExportOptionsDto options, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");
        WriteSheet(sheet, document, options);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }

    public Task<byte[]> GenerateBatchExcelAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default)
    {
        var included = options.IncludedDocumentIds is { Count: > 0 } docIds
            ? documents.Where(d => docIds.Contains(d.Id)).ToList()
            : documents;

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Extracted Data");
        if (options.Layout == ExportLayout.RowsPerField)
            WriteRowsPerFieldBatchSheet(sheet, included, options);
        else
            WriteColumnsPerFieldSheet(sheet, included, options);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }

    public Task<byte[]> GenerateMultiSheetExcelAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default)
    {
        var included = options.IncludedDocumentIds is { Count: > 0 } docIds
            ? documents.Where(d => docIds.Contains(d.Id)).ToList()
            : documents;

        using var workbook = new XLWorkbook();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var doc in included)
        {
            var sheet = workbook.Worksheets.Add(SafeSheetName(doc.OriginalFileName, usedNames));
            WriteSheet(sheet, doc, options);
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return Task.FromResult(stream.ToArray());
    }

    public Task<byte[]> GenerateSeparateFilesZipAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default)
    {
        var included = options.IncludedDocumentIds is { Count: > 0 } docIds
            ? documents.Where(d => docIds.Contains(d.Id)).ToList()
            : documents;

        using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var doc in included)
            {
                using var workbook = new XLWorkbook();
                var sheet = workbook.Worksheets.Add("Extracted Data");
                WriteSheet(sheet, doc, options);

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
