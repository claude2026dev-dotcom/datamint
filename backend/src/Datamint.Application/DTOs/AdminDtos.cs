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
    string? UserAgent,
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
    DateTime? LastLoginAtUtc,
    bool HasPassword);

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
    int Page = 1,
    int PageSize = 25);

public record UpdateUserRequestDto(string? DisplayName, string? Role);

public record UpdatePlanRequestDto(string Name, string? Description, decimal Price, string Currency, string BillingCycle, int MonthlyUploadLimit);

public record AdminPlanDto(
    Guid Id,
    string Name,
    string? Description,
    decimal Price,
    string Currency,
    string BillingCycle,
    int MonthlyUploadLimit,
    bool IsActive,
    int ActiveSubscribers);
