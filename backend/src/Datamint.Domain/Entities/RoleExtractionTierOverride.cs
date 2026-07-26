namespace Datamint.Domain.Entities;

/// <summary>
/// Admin-managed override so a whole Role (e.g. every "Admin" account) can be pinned to a
/// specific Extraction Tier regardless of what Plan any individual account happens to be on -
/// useful for giving internal/staff accounts a consistently better tier without having to
/// subscribe them to a specific paid plan. Checked before a user's Plan-based tier in
/// IExtractionTierResolver; a null ExtractionTierId means "no override for this role", falling
/// through to the normal Plan -> default resolution. Exactly one row per Role value ("Admin",
/// "User") is seeded once and only ever updated, never created/deleted via the admin UI.
/// </summary>
public class RoleExtractionTierOverride : BaseEntity
{
    public string Role { get; set; } = default!;
    public Guid? ExtractionTierId { get; set; }
    public ExtractionTier? ExtractionTier { get; set; }
}
