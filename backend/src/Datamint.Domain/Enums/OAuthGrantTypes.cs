namespace Datamint.Domain.Enums;

/// <summary>
/// Which OAuth2 grants an OAuthClient is allowed to use, stored as a bitmask so one client can
/// support several. Kept as a plain int bitmask in the DB rather than a JSON string array -
/// translated to/from a List&lt;string&gt; ("authorization_code", "client_credentials",
/// "refresh_token") only at the DTO boundary via OAuthGrantTypeMapper, deliberately avoiding
/// the app's global JsonStringEnumConverter (registered in Program.cs), which serializes/parses
/// enum values by exact name and doesn't handle combined [Flags] values.
/// </summary>
[Flags]
public enum OAuthGrantTypes
{
    None = 0,
    AuthorizationCode = 1,
    ClientCredentials = 2,
    RefreshToken = 4
}
