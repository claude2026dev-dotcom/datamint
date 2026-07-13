using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

public class JsonExportService : IJsonExportService
{
    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };

    /// <summary>Same include-filter every export path applies: an explicit IncludedFieldIds
    /// override wins if given, otherwise each field's own saved IncludeInExport flag decides.</summary>
    private static IEnumerable<ExtractedFieldEditDto> FilterFields(IEnumerable<ExtractedFieldEditDto> fields, ExportOptionsDto options) =>
        options.IncludedFieldIds is { Count: > 0 } ids
            ? fields.Where(f => ids.Contains(f.Id))
            : fields.Where(f => f.IncludeInExport);

    private static JsonExportDocumentDto ToDocumentDto(DocumentDetailDto document, ExportOptionsDto options)
    {
        var sections = FilterFields(document.Fields, options)
            .OrderBy(f => f.SortOrder)
            .GroupBy(f => f.SectionLabel)
            .Select(g => new JsonExportSectionDto(
                g.Key,
                g.Select(f => new JsonExportFieldDto(f.FieldKey, f.FieldValue, f.SemanticType, f.OriginalFieldKey, f.WasEditedByUser, f.PageNumber)).ToList()))
            .ToList();

        return new JsonExportDocumentDto(document.Id, document.OriginalFileName, sections);
    }

    public Task<byte[]> GenerateDocumentJsonAsync(DocumentDetailDto document, ExportOptionsDto options, CancellationToken ct = default)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(ToDocumentDto(document, options), WriteOptions);
        return Task.FromResult(bytes);
    }

    public Task<byte[]> GenerateBatchJsonAsync(List<DocumentDetailDto> documents, ExportOptionsDto options, CancellationToken ct = default)
    {
        var included = options.IncludedDocumentIds is { Count: > 0 } docIds
            ? documents.Where(d => docIds.Contains(d.Id))
            : documents;

        var batch = new JsonExportBatchDto(included.Select(d => ToDocumentDto(d, options)).ToList());
        var bytes = JsonSerializer.SerializeToUtf8Bytes(batch, WriteOptions);
        return Task.FromResult(bytes);
    }
}
