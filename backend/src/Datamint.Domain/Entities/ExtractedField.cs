namespace Datamint.Domain.Entities;

/// <summary>
/// A single key/value pair the AI extracted from the PDF. Editable by the
/// user in the preview screen before export, so it keeps an "original" value
/// alongside the current (possibly user-edited) one for audit purposes.
/// </summary>
public class ExtractedField : BaseEntity
{
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public int? PageNumber { get; set; }             // null = document-level field

    public string FieldKey { get; set; } = default!;   // editable custom label shown/exported to the user
    public string OriginalFieldKey { get; set; } = default!; // untouched label as the AI found it - always shown read-only for reference
    public string? FieldValue { get; set; }
    public string? OriginalAiValue { get; set; }      // untouched value as returned by Claude
    public bool WasEditedByUser { get; set; }
    public int SortOrder { get; set; }
}
