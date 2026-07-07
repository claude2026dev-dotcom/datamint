namespace Datamint.Application.DTOs;

public record AdminDashboardStatsDto(
    int TotalUsers,
    int ActiveSubscriptions,
    int TotalDocumentsProcessed,
    int DocumentsProcessedToday,
    int FailedExtractionsLast7Days,
    decimal RevenueThisMonth);

public record AuditLogDto(
    Guid Id,
    string? UserEmail,
    string Action,
    string? EntityType,
    string? EntityId,
    string? Details,
    string? IpAddress,
    bool IsSuccess,
    DateTime CreatedAtUtc);

public record AdminUserListItemDto(
    Guid Id,
    string Email,
    string? DisplayName,
    string Role,
    bool IsActive,
    string? CurrentPlan,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc);

public record AuditLogFilterDto(string? Action, Guid? UserId, DateTime? FromUtc, DateTime? ToUtc, int Page = 1, int PageSize = 25);
