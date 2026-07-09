namespace Datamint.Application.Interfaces;

/// <summary>Shared claim-type name so the token issuer (JwtTokenService) and the
/// per-request validator (Program.cs's OnTokenValidated) always agree on it.</summary>
public static class JwtClaimTypes
{
    public const string SecurityStamp = "security_stamp";
}
