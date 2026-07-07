namespace Datamint.Application.Common;

/// <summary>
/// Uniform success/failure wrapper returned by every service method, so
/// controllers never need try/catch around business logic — only the
/// global exception middleware handles truly unexpected errors.
/// </summary>
public class Result<T>
{
    public bool Succeeded { get; }
    public T? Data { get; }
    public string? Error { get; }
    public string? ErrorCode { get; }

    private Result(bool succeeded, T? data, string? error, string? errorCode)
    {
        Succeeded = succeeded;
        Data = data;
        Error = error;
        ErrorCode = errorCode;
    }

    public static Result<T> Success(T data) => new(true, data, null, null);
    public static Result<T> Failure(string error, string errorCode = "GENERAL_ERROR") => new(false, default, error, errorCode);
}

public class Result
{
    public bool Succeeded { get; }
    public string? Error { get; }
    public string? ErrorCode { get; }

    private Result(bool succeeded, string? error, string? errorCode)
    {
        Succeeded = succeeded;
        Error = error;
        ErrorCode = errorCode;
    }

    public static Result Success() => new(true, null, null);
    public static Result Failure(string error, string errorCode = "GENERAL_ERROR") => new(false, error, errorCode);
}
