using System.Net;
using System.Text.Json;
using Datamint.Application.Common;
using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Datamint.API.Controllers;

/// <summary>
/// The public OAuth2 protocol surface (RFC 6749 authorization_code + client_credentials +
/// refresh_token, PKCE per RFC 7636). All decision-making logic lives in IOAuthService - this
/// controller only handles HTTP shape: query/form binding, redirects, and rendering the
/// client-branded login+consent page. See IOAuthService/OAuthService for the actual protocol
/// rules and the security reasoning behind each of them.
/// </summary>
[ApiController]
[Route("oauth")]
public class OAuthController : ControllerBase
{
    private readonly IOAuthService _oauth;
    private readonly ICurrentUserService _currentUser;

    public OAuthController(IOAuthService oauth, ICurrentUserService currentUser)
    {
        _oauth = oauth;
        _currentUser = currentUser;
    }

    /// <summary>
    /// Entry point of the flow. Only two failure modes are "unsafe to redirect anywhere" -
    /// unknown client_id, or a redirect_uri not on that client's exact-match whitelist - both
    /// render a local error page instead of bouncing the browser to an unverified URL. Every
    /// other failure (bad response_type, missing/weak PKCE, unknown scope) is safe to send back
    /// to the CLIENT as a query-string error (RFC 6749 §4.1.2.1), since redirect_uri has
    /// already been confirmed legitimate by that point.
    /// </summary>
    [HttpGet("authorize")]
    [AllowAnonymous]
    public async Task<IActionResult> Authorize(
        [FromQuery] string client_id, [FromQuery] string redirect_uri, [FromQuery] string? response_type,
        [FromQuery] string? scope, [FromQuery] string? state, [FromQuery] string? code_challenge,
        [FromQuery] string? code_challenge_method, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(client_id) || string.IsNullOrWhiteSpace(redirect_uri))
            return RenderErrorPage("Invalid request", "This authorization link is missing required information.");

        var client = await _oauth.FindClientForRedirectAsync(client_id, redirect_uri, ct);
        if (client is null)
            return RenderErrorPage("Invalid request", "This application isn't registered, or isn't allowed to redirect to that address.");

        var safeState = state ?? "";

        if (!string.Equals(response_type, "code", StringComparison.Ordinal))
            return Redirect(BuildRedirect(redirect_uri, ("error", "unsupported_response_type"), ("state", safeState)));

        if (string.IsNullOrWhiteSpace(code_challenge) || !string.Equals(code_challenge_method, "S256", StringComparison.Ordinal))
            return Redirect(BuildRedirect(redirect_uri, ("error", "invalid_request"), ("error_description", "PKCE (S256) is required."), ("state", safeState)));

        try
        {
            await _oauth.ResolveScopeAsync(client, scope, ct);
        }
        catch (OAuthException)
        {
            return Redirect(BuildRedirect(redirect_uri, ("error", "invalid_scope"), ("state", safeState)));
        }

        return Redirect(BuildRedirect("/oauth/login",
            ("client_id", client_id), ("redirect_uri", redirect_uri), ("scope", scope ?? ""),
            ("state", safeState), ("code_challenge", code_challenge), ("code_challenge_method", code_challenge_method!)));
    }

    /// <summary>The actual login + consent UI. Everything GET /oauth/authorize already
    /// validated is re-checked here too (defense in depth) before the page even renders a
    /// form.</summary>
    [HttpGet("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(
        [FromQuery] string client_id, [FromQuery] string redirect_uri, [FromQuery] string? scope,
        [FromQuery] string? state, [FromQuery] string? code_challenge, [FromQuery] string? code_challenge_method,
        CancellationToken ct)
    {
        var client = await _oauth.FindClientForRedirectAsync(client_id, redirect_uri, ct);
        if (client is null)
            return RenderErrorPage("Invalid request", "This application isn't registered, or isn't allowed to redirect to that address.");

        var requestedNames = string.IsNullOrWhiteSpace(scope)
            ? client.Scopes.Where(s => s.IsEnabled && s.IsDefault).Select(s => s.Name)
            : scope.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var scopes = await _oauth.GetScopesAsync(requestedNames, ct);

        return Content(RenderLoginPage(client, redirect_uri, scope ?? "", state ?? "", code_challenge ?? "", code_challenge_method ?? "", scopes), "text/html");
    }

    /// <summary>Called by the login page's own JS once it has a fresh access token (proof of
    /// identity) and, if consent was required, the user's Allow/Deny choice. Mints a single-use
    /// authorization code and hands back where to send the browser next - the page does the
    /// actual navigation.</summary>
    [HttpPost("authorize/complete")]
    [Authorize]
    public async Task<IActionResult> AuthorizeComplete(OAuthAuthorizeCompleteRequestDto request, CancellationToken ct)
    {
        var result = await _oauth.CompleteAuthorizeAsync(_currentUser.UserId!.Value, request, ct);
        return Ok(result);
    }

    /// <summary>The token endpoint - one entry point for all three grants (RFC 6749 §3.2),
    /// dispatched internally by IOAuthService based on grant_type. Form-encoded, not JSON -
    /// the one deliberate exception to this API's usual JSON-only convention, because RFC 6749
    /// §4.1.3/§4.4.2/§6 all specify application/x-www-form-urlencoded.</summary>
    [HttpPost("token")]
    [AllowAnonymous]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IActionResult> Token(
        [FromForm(Name = "grant_type")] string grant_type,
        [FromForm(Name = "code")] string? code,
        [FromForm(Name = "redirect_uri")] string? redirect_uri,
        [FromForm(Name = "client_id")] string? client_id,
        [FromForm(Name = "client_secret")] string? client_secret,
        [FromForm(Name = "code_verifier")] string? code_verifier,
        [FromForm(Name = "refresh_token")] string? refresh_token,
        [FromForm(Name = "scope")] string? scope,
        CancellationToken ct)
    {
        // RFC 6749 §5.1 - a token response must never be cached.
        Response.Headers.CacheControl = "no-store";
        Response.Headers.Pragma = "no-cache";

        var request = new OAuthTokenRequestDto(grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token, scope);
        var result = await _oauth.ExchangeTokenAsync(request, ct);
        return Ok(result);
    }

    private static string BuildRedirect(string baseUri, params (string Key, string Value)[] pairs)
    {
        var separator = baseUri.Contains('?') ? "&" : "?";
        var query = string.Join("&", pairs.Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));
        return $"{baseUri}{separator}{query}";
    }

    // ---------- HTML rendering ----------

    private ContentResult RenderErrorPage(string title, string message)
    {
        Response.StatusCode = 400;
        var html = $$"""
            <!doctype html>
            <html lang="en">
            <head><meta charset="utf-8" /><title>{{WebUtility.HtmlEncode(title)}} — Datamint</title>{{SharedStyles}}</head>
            <body>
              <div class="card">
                <div class="brand"><span class="brand-mark">D</span><span class="brand-name">Datamint</span></div>
                <h1>{{WebUtility.HtmlEncode(title)}}</h1>
                <p class="sub">{{WebUtility.HtmlEncode(message)}}</p>
              </div>
            </body>
            </html>
            """;
        return Content(html, "text/html");
    }

    private static string RenderLoginPage(OAuthClient client, string redirectUri, string scope, string state,
        string codeChallenge, string codeChallengeMethod, List<OAuthScope> scopes)
    {
        static string ToJs(string? value) =>
            JsonSerializer.Serialize(value ?? "").Replace("</script", "<\\/script", StringComparison.OrdinalIgnoreCase);

        var brandMarkHtml = string.IsNullOrWhiteSpace(client.LogoUrl)
            ? $"""<span class="brand-mark">{WebUtility.HtmlEncode(client.Name[..1].ToUpperInvariant())}</span>"""
            : $"""<img class="brand-logo" src="{WebUtility.HtmlEncode(client.LogoUrl)}" alt="" />""";

        var scopeListHtml = string.Join("", scopes.Select(s => $"""
            <li><span class="scope-name">{WebUtility.HtmlEncode(s.DisplayName)}</span>
            {(string.IsNullOrWhiteSpace(s.Description) ? "" : $"""<span class="scope-desc">{WebUtility.HtmlEncode(s.Description)}</span>""")}</li>
            """));

        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8" />
            <title>Sign in — {{WebUtility.HtmlEncode(client.Name)}}</title>
            {{SharedStyles}}
            </head>
            <body>
              <div class="card">
                <div class="brand">{{brandMarkHtml}}<span class="brand-name">{{WebUtility.HtmlEncode(client.Name)}}</span></div>

                <div id="login-step">
                  <h1>Sign in to continue</h1>
                  <p class="sub">Log in with your Datamint account to authorize <strong>{{WebUtility.HtmlEncode(client.Name)}}</strong>.</p>
                  <div id="error" class="error"></div>
                  <form id="login-form">
                    <label for="email">Email</label>
                    <input id="email" type="email" autocomplete="username" required />
                    <label for="password">Password</label>
                    <input id="password" type="password" autocomplete="current-password" required />
                    <button id="login-submit" type="submit">Sign in</button>
                  </form>
                </div>

                <div id="consent-step" class="hidden">
                  <h1>{{WebUtility.HtmlEncode(client.Name)}} wants to</h1>
                  <ul class="scope-list">{{scopeListHtml}}</ul>
                  <div class="consent-actions">
                    <button id="deny-btn" class="btn-ghost" type="button">Deny</button>
                    <button id="allow-btn" class="btn-primary" type="button">Allow</button>
                  </div>
                </div>
              </div>
              <script>
                const params = {
                  clientId: {{ToJs(client.ClientId)}},
                  redirectUri: {{ToJs(redirectUri)}},
                  scope: {{ToJs(scope)}},
                  state: {{ToJs(state)}},
                  codeChallenge: {{ToJs(codeChallenge)}},
                  codeChallengeMethod: {{ToJs(codeChallengeMethod)}}
                };
                const requireConsent = {{(client.RequireConsent ? "true" : "false")}};
                let accessToken = null;

                const loginStep = document.getElementById('login-step');
                const consentStep = document.getElementById('consent-step');
                const errorBox = document.getElementById('error');
                const submitBtn = document.getElementById('login-submit');

                document.getElementById('login-form').addEventListener('submit', async (e) => {
                  e.preventDefault();
                  errorBox.style.display = 'none';
                  submitBtn.disabled = true;
                  submitBtn.textContent = 'Signing in…';
                  try {
                    const res = await fetch('/api/auth/login', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: document.getElementById('email').value,
                        password: document.getElementById('password').value,
                        rememberMe: false
                      })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Invalid email or password.');
                    accessToken = data.accessToken;

                    if (requireConsent) {
                      loginStep.classList.add('hidden');
                      consentStep.classList.remove('hidden');
                    } else {
                      await complete(true);
                    }
                  } catch (err) {
                    errorBox.textContent = err.message || 'Something went wrong. Please try again.';
                    errorBox.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign in';
                  }
                });

                const allowBtn = document.getElementById('allow-btn');
                const denyBtn = document.getElementById('deny-btn');
                allowBtn.addEventListener('click', () => complete(true));
                denyBtn.addEventListener('click', () => complete(false));

                // A single authorization code is only ever redeemable once (RFC 6749 §4.1.2) - a
                // double-click here would mint two codes and race two redirects, so both buttons
                // are locked the instant either is pressed, exactly like the login form's submit
                // button above.
                let completing = false;

                async function complete(consented) {
                  if (completing) return;
                  completing = true;
                  allowBtn.disabled = true;
                  denyBtn.disabled = true;
                  try {
                    const res = await fetch('/oauth/authorize/complete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
                      body: JSON.stringify({
                        clientId: params.clientId, redirectUri: params.redirectUri, scope: params.scope,
                        state: params.state, codeChallenge: params.codeChallenge,
                        codeChallengeMethod: params.codeChallengeMethod, consented
                      })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
                    window.location.href = data.redirectUrl;
                  } catch (err) {
                    completing = false;
                    allowBtn.disabled = false;
                    denyBtn.disabled = false;
                    loginStep.classList.remove('hidden');
                    consentStep.classList.add('hidden');
                    errorBox.textContent = err.message || 'Something went wrong. Please try again.';
                    errorBox.style.display = 'block';
                  }
                }
              </script>
            </body>
            </html>
            """;
    }

    /// <summary>Shared dark, brand-styled look for every page this controller renders -
    /// deliberately Datamint-toned even on a third-party client's login step (only the logo/name
    /// up top change), so the page never looks like a generic unstyled form. Includes basic
    /// clickjacking hardening (frame-ancestors 'none' / X-Frame-Options) since this is a real
    /// credential-entry form.</summary>
    private const string SharedStyles = """
        <meta http-equiv="X-Frame-Options" content="DENY" />
        <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'" />
        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
            background: #0b0e17; color: #e5e7f0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .card {
            width: 100%; max-width: 380px; margin: 24px; padding: 32px;
            background: #12172a; border: 1px solid #262e4a; border-radius: 14px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          }
          .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
          .brand-mark {
            width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
            background: linear-gradient(135deg, #6366f1, #22d3ee);
            display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff;
          }
          .brand-logo { width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; object-fit: contain; }
          .brand-name { font-weight: 800; font-size: 1.05rem; }
          h1 { font-size: 1.15rem; margin: 0 0 4px; }
          p.sub { color: #9095b3; font-size: 0.85rem; margin: 0 0 22px; }
          label { display: block; font-size: 0.82rem; color: #9095b3; margin: 14px 0 6px; }
          input {
            width: 100%; padding: 10px 12px; font-size: 0.92rem; color: #e5e7f0;
            background: #171d33; border: 1px solid #262e4a; border-radius: 8px; outline: none;
          }
          input:focus { border-color: #6366f1; }
          button {
            padding: 11px 18px; font-size: 0.92rem; font-weight: 700; border: none; border-radius: 8px; cursor: pointer;
          }
          button:disabled { opacity: 0.6; cursor: not-allowed; }
          #login-form button, .btn-primary {
            width: 100%; color: #fff; background: linear-gradient(135deg, #6366f1, #22d3ee);
          }
          #login-form button { margin-top: 22px; }
          .btn-ghost { background: transparent; color: #9095b3; border: 1px solid #262e4a; }
          .error {
            display: none; margin-top: 16px; padding: 10px 12px; font-size: 0.82rem;
            background: rgba(239,68,68,0.12); border: 1px solid #f87171; color: #f87171; border-radius: 8px;
          }
          .hidden { display: none; }
          .scope-list { list-style: none; margin: 4px 0 24px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
          .scope-list li { padding: 12px 14px; background: #171d33; border: 1px solid #262e4a; border-radius: 8px; }
          .scope-name { display: block; font-size: 0.9rem; font-weight: 600; }
          .scope-desc { display: block; font-size: 0.78rem; color: #9095b3; margin-top: 3px; }
          .consent-actions { display: flex; gap: 10px; }
          .consent-actions button { flex: 1; }
        </style>
        """;
}
