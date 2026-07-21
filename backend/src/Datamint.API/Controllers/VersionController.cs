using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Datamint.API.Controllers;

public record VersionDto(string Version, string Environment);

/// <summary>
/// Reports the app's version (bumped in one place - backend/Directory.Build.props, see
/// docs/WORKFLOW.md) and which ASPNETCORE_ENVIRONMENT is active - useful for confirming which
/// build/environment a running instance actually is without SSHing in to check config.
/// </summary>
[ApiController]
[Route("api/version")]
[AllowAnonymous]
public class VersionController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    public VersionController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpGet]
    public ActionResult<VersionDto> Get()
    {
        // AssemblyInformationalVersion is set directly from Directory.Build.props's <Version>
        // (e.g. "1.0.0") - AssemblyVersion would instead give the padded "1.0.0.0".
        var version = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";
        return Ok(new VersionDto(version, _env.EnvironmentName));
    }
}
