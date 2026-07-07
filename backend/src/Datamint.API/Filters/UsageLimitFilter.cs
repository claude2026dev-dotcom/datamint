namespace Datamint.API.Filters;

/// <summary>
/// Marker attribute for endpoints that must check the caller's plan/free-tier
/// upload limit before proceeding. Actual limit-check logic lives in
/// DocumentsController (kept close to the upload action so the rule is easy
/// to find and reason about) — this attribute exists so it's declaratively
/// visible on the action and easy to unit test in isolation later.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public class EnforcesUploadLimitAttribute : Attribute { }
