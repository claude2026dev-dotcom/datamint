namespace Datamint.Domain.Entities;

/// <summary>
/// A single key/value pair the AI extracted from the document. Editable by the user in the
/// review screen before export, so it keeps an "original" value alongside the current
/// (possibly user-edited) one for audit purposes.
/// </summary>
public class ExtractedField : BaseEntity
{
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public int? PageNumber { get; set; } // null = document-level field

    public string FieldKey { get; set; } = default!;         // editable custom label shown/exported to the user
    public string OriginalFieldKey { get; set; } = default!; // untouched label as the AI found it - always shown read-only for reference
    public string? FieldValue { get; set; }
    public string? OriginalAiValue { get; set; }              // untouched value as returned by the AI
    public bool WasEditedByUser { get; set; }
    public int SortOrder { get; set; }

    // AI-suggested classification, matching real spreadsheet cell data types - "Text"/"Number"/
    // "Currency"/"Date"/"Percentage"/"Boolean" - not a fixed enum since a user can still type a
    // custom value. Drives both the review UI's type picker and the Excel export's per-cell
    // number format (see ExcelExportService.SetTypedValue).
    public string? SemanticType { get; set; }
    // Untouched classification as the AI found it - a user changing the type (e.g. correcting
    // a misdetected Number to Currency) counts as an edit alongside the key/value, same as
    // OriginalFieldKey/OriginalAiValue above.
    public string? OriginalSemanticType { get; set; }

    // AI-suggested group name for organizing related fields together, e.g. "Shipping Details",
    // "Billing Info", "Line Items" - free text, not a separate entity; renaming a section is
    // just a bulk update of this string across the fields that share it.
    public string? SectionLabel { get; set; }

    // Per-field export toggle the user can flip while reviewing. Defaults true so every
    // newly-extracted field is included unless explicitly excluded.
    public bool IncludeInExport { get; set; } = true;
}
