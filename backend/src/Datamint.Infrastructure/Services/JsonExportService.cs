using System.Text.Json;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;

namespace Datamint.Infrastructure.Services;

/// <summary>Exports extracted fields as structured JSON, grouped by section - the same
/// grouping the review UI's section-editor shows on screen, so the JSON export mirrors
/// exactly what the user saw and edited.</summary>
public class JsonExportService : IJsonExportService
{
    private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

    private static List<ExtractedField> FilterFields(List<ExtractedField> fields, List<Guid>? includedFieldIds) =>
        (includedFieldIds is { Count: > 0 } ids
            ? fields.Where(f => ids.Contains(f.Id))
            : fields.Where(f => f.IncludeInExport))
        .ToList();

    private static object BuildDocumentPayload(string fileName, List<ExtractedField> fields, List<Guid>? includedFieldIds)
    {
        var filtered = FilterFields(fields, includedFieldIds).OrderBy(f => f.SortOrder).ToList();
        var sections = filtered
            .GroupBy(f => f.SectionLabel ?? "General")
            .Select(g => new
            {
                section = g.Key,
                fields = g.Select(f => new
                {
                    key = f.FieldKey,
                    value = f.FieldValue,
                    page = f.PageNumber,
                    type = f.SemanticType,
                    edited = f.WasEditedByUser
                })
            });

        return new { fileName, sections };
    }

    public ExportResultDto ExportSingle(string fileName, List<ExtractedField> fields, List<Guid>? includedFieldIds)
    {
        var payload = BuildDocumentPayload(fileName, fields, includedFieldIds);
        var json = JsonSerializer.Serialize(payload, SerializerOptions);
        return new ExportResultDto(System.Text.Encoding.UTF8.GetBytes(json), "application/json", $"{Path.GetFileNameWithoutExtension(fileName)}.json");
    }

    public ExportResultDto ExportBatch(List<(string FileName, List<ExtractedField> Fields)> documents)
    {
        var payload = documents.Select(d => BuildDocumentPayload(d.FileName, d.Fields, null)).ToList();
        var json = JsonSerializer.Serialize(payload, SerializerOptions);
        return new ExportResultDto(System.Text.Encoding.UTF8.GetBytes(json), "application/json", "extracted-data.json");
    }
}
