namespace Datamint.Application.Common;

/// <summary>
/// Single shared HTML layout for every outbound email (account-lifecycle and export-delivery),
/// so they render consistently and correctly in real email clients (which default to a light
/// background) instead of assuming the app's own dark UI theme.
/// </summary>
public static class EmailTemplateHelper
{
    public static string Wrap(string appName, string title, string greeting, string bodyHtml, string? ctaLabel = null, string? ctaUrl = null)
    {
        var button = ctaLabel is not null && ctaUrl is not null
            ? $"""<div style="margin:28px 0;"><a href="{ctaUrl}" style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px;display:inline-block;">{ctaLabel}</a></div>"""
            : "";

        return $"""
            <div style="background:#f2f3f8;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
              <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3e5f0;border-radius:14px;padding:32px;">
                <div style="font-weight:800;font-size:18px;color:#1a1d29;margin-bottom:20px;">
                  <span style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff;border-radius:8px;padding:4px 9px;margin-right:8px;">D</span>{appName}
                </div>
                <h2 style="color:#1a1d29;font-size:20px;margin:0 0 14px;">{title}</h2>
                <p style="color:#1a1d29;font-size:14px;margin:0 0 6px;">{greeting}</p>
                <div style="color:#333846;font-size:14px;line-height:1.6;">{bodyHtml}</div>
                {button}
                <p style="color:#767b93;font-size:12px;margin-top:28px;border-top:1px solid #e3e5f0;padding-top:16px;">{appName} — AI-powered PDF data extraction.</p>
              </div>
            </div>
            """;
    }

    /// <summary>Muted secondary-text color that stays readable on the white card background.</summary>
    public const string MutedTextStyle = "color:#767b93;font-size:13px;";
}
