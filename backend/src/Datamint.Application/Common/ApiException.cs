namespace Datamint.Application.Common;

/// <summary>
/// Thrown deliberately by application services for expected business-rule
/// violations (plan limit reached, invalid file, etc). The global exception
/// middleware maps this to a clean 4xx response instead of a 500 + stack trace.
/// </summary>
public class ApiException : Exception
{
    public int StatusCode { get; }
    public string ErrorCode { get; }

    public ApiException(string message, int statusCode = 400, string errorCode = "BAD_REQUEST") : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }
}
