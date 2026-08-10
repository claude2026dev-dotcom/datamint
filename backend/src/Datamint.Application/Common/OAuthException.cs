namespace Datamint.Application.Common;

/// <summary>
/// Thrown by OAuth protocol endpoints (/oauth/token, /oauth/authorize/complete) instead of
/// ApiException - the OAuth2 spec requires a different error envelope
/// ({"error": "...", "error_description": "..."}, RFC 6749 §5.2) than the rest of this app's
/// {success, message, errorCode} shape. ExceptionHandlingMiddleware special-cases this type to
/// write the RFC shape (and, for "invalid_client", a 401 with a WWW-Authenticate header)
/// instead of the normal envelope - callers just `throw new OAuthException(...)`, same as
/// ApiException elsewhere in the app.
/// </summary>
public class OAuthException : Exception
{
    /// <summary>One of the RFC 6749 §5.2 error codes: invalid_request, invalid_client,
    /// invalid_grant, unauthorized_client, unsupported_grant_type, invalid_scope, access_denied.</summary>
    public string Error { get; }
    public string? ErrorDescription { get; }
    public int StatusCode { get; }

    public OAuthException(string error, string? errorDescription = null, int statusCode = 400)
        : base(errorDescription ?? error)
    {
        Error = error;
        ErrorDescription = errorDescription;
        StatusCode = statusCode;
    }
}
