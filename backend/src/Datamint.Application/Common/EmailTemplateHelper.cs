namespace Datamint.Application.Common;

/// <summary>
/// Single shared HTML layout for every outbound email (account-lifecycle, billing, and
/// export-delivery), so they render consistently and correctly in real email clients (which
/// default to a light background) instead of assuming the app's own dark UI theme.
/// </summary>
public static class EmailTemplateHelper
{
    /// <param name="logoUrl">
    /// Optional - once a real logo image is available, set "App:LogoUrl" in config and every
    /// email switches to it automatically. Until then falls back to a plain letter mark built
    /// from appName, so branding never looks broken just because no logo has been supplied yet.
    /// </param>
    public static string Wrap(string appName, string title, string greeting, string bodyHtml, string? ctaLabel = null, string? ctaUrl = null, string? logoUrl = null)
    {
        var button = ctaLabel is not null && ctaUrl is not null
            ? $"""<div style="margin:28px 0;"><a href="{ctaUrl}" style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:8px;display:inline-block;">{ctaLabel}</a></div>"""
            : "";

        var brandMark = string.IsNullOrWhiteSpace(logoUrl)
            ? $"""<span style="background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff;border-radius:8px;padding:4px 9px;margin-right:8px;">{appName[..1].ToUpper()}</span>{appName}"""
            : $"""<img src="{logoUrl}" alt="{appName}" style="height:28px;vertical-align:middle;" />""";

        return $"""
            <div style="background:#f2f3f8;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
              <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3e5f0;border-radius:14px;padding:32px;">
                <div style="font-weight:800;font-size:18px;color:#1a1d29;margin-bottom:20px;">
                  {brandMark}
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

    /// <summary>Compact line-item table used by invoice/receipt emails - kept separate from
    /// Wrap's free-form bodyHtml so every invoice-style email renders identical column widths.</summary>
    public static string InvoiceTable(string invoiceNumber, DateTime issuedAtUtc, IEnumerable<(string Label, string Value)> lines, string totalLabel, string totalValue) => $"""
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
          <tr><td style="{MutedTextStyle}padding:4px 0;">Invoice</td><td style="padding:4px 0;text-align:right;">{invoiceNumber}</td></tr>
          <tr><td style="{MutedTextStyle}padding:4px 0;">Date</td><td style="padding:4px 0;text-align:right;">{issuedAtUtc:MMM d, yyyy}</td></tr>
          {string.Join("", lines.Select(l => $"""<tr><td style="padding:4px 0;border-top:1px solid #e3e5f0;">{l.Label}</td><td style="padding:4px 0;text-align:right;border-top:1px solid #e3e5f0;">{l.Value}</td></tr>"""))}
          <tr><td style="padding:10px 0 4px;border-top:2px solid #1a1d29;font-weight:700;">{totalLabel}</td><td style="padding:10px 0 4px;text-align:right;border-top:2px solid #1a1d29;font-weight:700;">{totalValue}</td></tr>
        </table>
        """;
}
