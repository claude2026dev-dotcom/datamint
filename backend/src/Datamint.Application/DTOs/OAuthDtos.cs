using System.Text.Json.Serialization;

namespace Datamint.Application.DTOs;

// ---------- Protocol DTOs (RFC 6749 / RFC 7636) ----------

/// <summary>Query-string params GET /oauth/authorize is called with.</summary>
public record OAuthAuthorizeRequestDto(
    string ClientId,
    string RedirectUri,
    string ResponseType,
    string? Scope,
    string State,
    string CodeChallenge,
    string CodeChallengeMethod);

/// <summary>Body of POST /oauth/authorize/complete - the same authorize params carried through
/// from the login/consent page, plus whether the user allowed or denied consent.</summary>
public record OAuthAuthorizeCompleteRequestDto(
    string ClientId,
    string RedirectUri,
    string? Scope,
    string State,
    string CodeChallenge,
    string CodeChallengeMethod,
    bool Consented);

public record OAuthAuthorizeCompleteResponseDto(string RedirectUrl);

/// <summary>Form-bound body of POST /oauth/token - one shape covers all three grant types;
/// OAuthController/OAuthService branch on GrantType and only read the fields that grant needs.
/// Property names are PascalCase C#, bound from snake_case form fields via [FromForm(Name=...)]
/// on the controller action - RFC 6749's wire format, not this app's usual camelCase JSON.</summary>
public record OAuthTokenRequestDto(
    string GrantType,
    string? Code,
    string? RedirectUri,
    string? ClientId,
    string? ClientSecret,
    string? CodeVerifier,
    string? RefreshToken,
    string? Scope);

/// <summary>Response of POST /oauth/token - snake_case via explicit [JsonPropertyName], which
/// wins over the app's globally-configured camelCase policy without touching that global
/// config (System.Text.Json always honors an explicit attribute over a naming policy).</summary>
public class OAuthTokenResponseDto
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; init; } = default!;

    [JsonPropertyName("token_type")]
    public string TokenType { get; init; } = "Bearer";

    [JsonPropertyName("expires_in")]
    public int ExpiresIn { get; init; }

    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; init; }

    [JsonPropertyName("scope")]
    public string Scope { get; init; } = default!;
}

// ---------- Admin: OAuth Clients ----------

public record OAuthClientListItemDto(
    Guid Id,
    string ClientId,
    string Name,
    string? LogoUrl,
    bool IsConfidential,
    bool IsEnabled,
    List<string> GrantTypes,
    int RedirectUriCount,
    DateTime CreatedAtUtc,
    string? CreatedByEmail);

public record OAuthClientDetailDto(
    Guid Id,
    string ClientId,
    string Name,
    string? LogoUrl,
    bool IsConfidential,
    bool RequireConsent,
    bool IsEnabled,
    List<string> GrantTypes,
    List<string> RedirectUris,
    List<string> ScopeNames,
    int AccessTokenLifetimeMinutes,
    int RefreshTokenLifetimeDays,
    DateTime CreatedAtUtc,
    string? CreatedByEmail);

public record CreateOAuthClientRequestDto(
    string Name,
    string? LogoUrl,
    bool IsConfidential,
    bool RequireConsent,
    List<string> RedirectUris,
    List<string> GrantTypes,
    List<string> ScopeNames,
    int AccessTokenLifetimeMinutes,
    int RefreshTokenLifetimeDays);

public record UpdateOAuthClientRequestDto(
    string Name,
    string? LogoUrl,
    bool RequireConsent,
    List<string> RedirectUris,
    List<string> GrantTypes,
    List<string> ScopeNames,
    int AccessTokenLifetimeMinutes,
    int RefreshTokenLifetimeDays);

/// <summary>Returned exactly once - at creation, and again if the secret is explicitly
/// regenerated. Never returned by any GET - only the hash is stored server-side.</summary>
public record OAuthClientSecretRevealDto(string ClientId, string ClientSecret);

public record OAuthClientFilterDto(
    string? Search,
    string? GrantType,
    bool? IsEnabled,
    string? SortBy,
    string? SortDir,
    int Page = 1,
    int PageSize = 25);

// ---------- Admin: OAuth Scopes ----------

public record OAuthScopeDto(
    Guid Id,
    string Name,
    string DisplayName,
    string? Description,
    bool IsDefault,
    bool IsEnabled,
    int ClientCount,
    DateTime CreatedAtUtc);

public record CreateOAuthScopeRequestDto(string Name, string DisplayName, string? Description, bool IsDefault);

public record UpdateOAuthScopeRequestDto(string DisplayName, string? Description, bool IsDefault);

public record OAuthScopeFilterDto(
    string? Search,
    bool? IsEnabled,
    int Page = 1,
    int PageSize = 25);
