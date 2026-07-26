using Datamint.Domain.Enums;

namespace Datamint.Domain.Entities;

/// <summary>
/// Admin-managed configuration of which AI provider/model does field extraction, and how its
/// prompt is customized, for whichever Plans get mapped to this tier. Never exposed to the end
/// user - a Plan's subscriber has no way to know which AI, model, or prompt customization is
/// actually being used behind their extraction results.
/// </summary>
public class ExtractionTier : BaseEntity
{
    public string Name { get; set; } = default!;
    public AiProvider AiProvider { get; set; } = AiProvider.Claude;
    public string ModelName { get; set; } = default!; // free-text model id, e.g. "claude-haiku-4-5" or "gpt-4o-mini"

    // Optional literal example of the JSON shape the AI should try to structurally match, on
    // top of the built-in schema instructions. Null/empty = built-in schema only, unmodified.
    public string? CustomOutputFormatExample { get; set; }

    // Optional free-text guidance appended to the built-in prompt's rule blocks (e.g. domain
    // hints, house style for field naming). Null/empty = built-in prompt, unmodified.
    public string? CustomInstructions { get; set; }

    // Exactly one tier has this set - the fallback used for a Plan with no ExtractionTierId
    // (or no plan at all, e.g. a normal free-trial signup). Can't be deleted or disabled,
    // same non-removable-safety-net pattern as ApplicationUser.IsSuperAdmin.
    public bool IsDefault { get; set; }
    public bool IsEnabled { get; set; } = true;

    public ICollection<Document> Documents { get; set; } = new List<Document>();
}
