namespace Datamint.Domain.Entities;

/// <summary>
/// Admin-managed override pinning ONE specific user account to a specific Extraction Tier,
/// regardless of their Plan or Role - the mechanism for a hand-negotiated custom AI/prompt setup
/// (e.g. after a lead comes in through Contact-us asking for a custom extraction configuration).
/// Checked before the Role-level override and before the user's Plan-based tier in
/// IExtractionTierResolver, since a customization negotiated for one specific customer should
/// always win over a broader default. Unlike RoleExtractionTierOverride (exactly two fixed rows,
/// always present, update-only), this row's mere EXISTENCE is the override - at most one row per
/// user, created/removed freely by an admin as customers are onboarded or offboarded.
/// </summary>
public class UserExtractionTierOverride : BaseEntity
{
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = default!;
    public Guid ExtractionTierId { get; set; }
    public ExtractionTier ExtractionTier { get; set; } = default!;
}
