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

    // AI-suggested classification, e.g. "Address"/"Date"/"Amount"/"Name"/"Reference"/"Contact"/
    // "Quantity"/"Generic" - deliberately domain-agnostic (works for invoices, shipping/logistics
    // manifests, contracts, etc.), not a fixed enum since the taxonomy may grow. Null on rows
    // extracted before this column existed - treat null as "Generic" everywhere it's read.
    public string? SemanticType { get; set; }
    // AI-suggested group name for organizing related fields together, e.g. "Shipping Details",
    // "Billing Info", "Line Items" - free text, not a separate entity (see ExtractedField doc
    // notes): renaming a section is just a bulk update of this string across the fields that
    // share it. Null on rows extracted before this column existed - treat null as "General".
    public string? SectionLabel { get; set; }
    // Per-field export toggle the user can flip while reviewing. Defaults true so every
    // pre-existing field (and every newly-extracted one) is included unless explicitly excluded.
    public bool IncludeInExport { get; set; } = true;
}
