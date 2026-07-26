namespace Datamint.Domain.Entities;

/// <summary>
/// A user-saved, reusable set of field names for "Formatted" extraction mode - lets someone
/// who repeatedly uploads the same kind of document (e.g. "GST Return", "Invoice") pick a
/// saved list instead of retyping the same field names on every upload.
/// </summary>
public class FieldTemplate : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public string Name { get; set; } = default!;

    // Comma-separated field names - the same format the upload form's requestedFields field
    // uses, so a saved template's Fields can be passed straight through to an upload without
    // any reshaping.
    public string Fields { get; set; } = default!;
}
