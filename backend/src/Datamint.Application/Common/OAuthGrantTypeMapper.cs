using Datamint.Domain.Enums;

namespace Datamint.Application.Common;

/// <summary>Translates the OAuthGrantTypes [Flags] bitmask to/from the wire-friendly string
/// list ("authorization_code", "client_credentials", "refresh_token") used at every DTO
/// boundary - see OAuthGrantTypes for why this stays out of the global JSON enum converter.</summary>
public static class OAuthGrantTypeMapper
{
    private const string AuthorizationCode = "authorization_code";
    private const string ClientCredentials = "client_credentials";
    private const string RefreshToken = "refresh_token";

    public static List<string> ToList(OAuthGrantTypes grants)
    {
        var result = new List<string>();
        if (grants.HasFlag(OAuthGrantTypes.AuthorizationCode)) result.Add(AuthorizationCode);
        if (grants.HasFlag(OAuthGrantTypes.ClientCredentials)) result.Add(ClientCredentials);
        if (grants.HasFlag(OAuthGrantTypes.RefreshToken)) result.Add(RefreshToken);
        return result;
    }

    /// <summary>Throws ApiException (400) on any name it doesn't recognize, rather than
    /// silently ignoring a typo'd grant type and leaving a client with fewer permissions
    /// than the admin who configured it intended.</summary>
    public static OAuthGrantTypes ToFlags(IEnumerable<string> names)
    {
        var result = OAuthGrantTypes.None;
        foreach (var name in names)
        {
            result |= name switch
            {
                AuthorizationCode => OAuthGrantTypes.AuthorizationCode,
                ClientCredentials => OAuthGrantTypes.ClientCredentials,
                RefreshToken => OAuthGrantTypes.RefreshToken,
                _ => throw new ApiException($"Unknown grant type '{name}'.", 400, "INVALID_GRANT_TYPE")
            };
        }
        return result;
    }
}
