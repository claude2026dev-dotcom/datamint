namespace Datamint.Application.DTOs;

public record AdminDashboardStatsDto(int TotalUsers);

public record AuditLogDto(
    Guid Id,
    string? UserEmail,
    string Action,
    string? EntityType,
    string? EntityId,
    string? Details,
    string? IpAddress,
    string? UserAgent,
    bool IsSuccess,
    DateTime CreatedAtUtc);

public record AdminUserListItemDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc,
    bool HasPassword,
    bool IsSuperAdmin,
    bool IsDeactivated,
    DateTime? DeactivatedAtUtc,
    int? DaysUntilPurge);

public record AuditLogFilterDto(
    string? Action,
    Guid? UserId,
    string? UserEmail,
    DateTime? FromUtc,
    DateTime? ToUtc,
    bool? IsSuccess = null,
    string? SortDir = "desc",
    int Page = 1,
    int PageSize = 25);

public record AdminUserFilterDto(
    string? Search,
    string? Role,
    bool? IsActive,
    string? SortBy,
    string? SortDir,
    bool IncludeDeactivated = false,
    int Page = 1,
    int PageSize = 25);

public record UpdateUserRequestDto(string? DisplayName, string? Role);
