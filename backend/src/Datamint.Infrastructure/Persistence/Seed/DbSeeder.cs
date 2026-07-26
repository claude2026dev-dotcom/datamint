using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Datamint.Infrastructure.Persistence.Seed;

/// <summary>
/// Seeds a default admin user (change the password immediately after first
/// login — default is admin@datamint.local / ChangeMe123!), plus the default OAuth2 scopes
/// and the built-in "Swagger UI" OAuth client Swagger's own Authorize button uses.
/// </summary>
public static class DbSeeder
{
    public const string SwaggerClientId = "datamint-swagger-ui";

    public static async Task SeedAsync(DatamintDbContext db, IConfiguration config)
    {
        await db.Database.MigrateAsync();

        if (!await db.Users.AnyAsync(u => u.Role == "Admin"))
        {
            db.Users.Add(new ApplicationUser
            {
                Email = "admin@datamint.local",
                DisplayName = "Datamint Admin",
                // Default password "ChangeMe123!" — sign in once, then change it immediately.
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe123!"),
                Role = "Admin",
                IsSuperAdmin = true,
                IsEmailVerified = true
            });
        }
        else if (!await db.Users.IgnoreQueryFilters().AnyAsync(u => u.IsSuperAdmin))
        {
            // Upgrade path for a DB created before IsSuperAdmin existed: promote the
            // earliest-created admin so there's always exactly one account that can
            // never be disabled/demoted/deleted, even by another admin.
            var earliestAdmin = await db.Users.Where(u => u.Role == "Admin")
                .OrderBy(u => u.CreatedAtUtc).FirstOrDefaultAsync();
            if (earliestAdmin is not null) earliestAdmin.IsSuperAdmin = true;
        }

        await db.SaveChangesAsync();
        await SeedOAuthAsync(db, config);
        await SeedExtractionTiersAsync(db);
        await SeedPlansAsync(db);
        await SeedRoleExtractionTierOverridesAsync(db);
    }

    /// <summary>One row per role, created once with no override (ExtractionTierId null) - the
    /// admin Roles tab only ever edits these two rows, never creates/deletes them.</summary>
    private static async Task SeedRoleExtractionTierOverridesAsync(DatamintDbContext db)
    {
        foreach (var role in new[] { "Admin", "User" })
        {
            if (await db.RoleExtractionTierOverrides.AnyAsync(r => r.Role == role)) continue;
            db.RoleExtractionTierOverrides.Add(new RoleExtractionTierOverride { Role = role });
        }
        await db.SaveChangesAsync();
    }

    /// <summary>Exactly one tier is ever flagged IsDefault - the fallback used for a Plan with
    /// no ExtractionTierId. Create-once: an admin's later edits to the default tier's model or
    /// prompt customization must never be silently reverted by a subsequent app restart.</summary>
    private static async Task SeedExtractionTiersAsync(DatamintDbContext db)
    {
        if (await db.ExtractionTiers.AnyAsync(t => t.IsDefault)) return;

        db.ExtractionTiers.Add(new ExtractionTier
        {
            Name = "Standard",
            AiProvider = AiProvider.Claude,
            ModelName = "claude-haiku-4-5",
            IsDefault = true,
            IsEnabled = true
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Seeds the free trial plan (10 pages, one-time, non-recurring) every user is
    /// auto-granted once at first sign-in - see AuthController.EnsureFreePlanActivatedAsync.
    /// Create-once, same reasoning as the admin user seed: an admin's later edits (e.g.
    /// changing the trial page count) must never be reverted by a restart.</summary>
    private static async Task SeedPlansAsync(DatamintDbContext db)
    {
        if (await db.Plans.AnyAsync(p => p.IsFreeTrial)) return;

        db.Plans.Add(new Plan
        {
            Name = "Free Trial",
            Description = "A one-time trial of 10 pages to try Datamint out - doesn't renew.",
            Price = 0,
            MonthlyPageLimit = 10,
            IsRecurring = false,
            IsFreeTrial = true,
            IsActive = true
        });
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Unlike the admin-user seed above (create-once), this re-runs its sync check on every
    /// startup: the built-in Swagger client's redirect_uri is environment-specific
    /// (different host in dev vs. prod), so a create-once seed would go stale the moment the
    /// app moves environments. Never destructive - only ever ADDS a missing default scope or a
    /// missing-for-this-environment redirect_uri, never removes anything an admin may have
    /// since customized via the OAuth Clients admin UI.
    /// </summary>
    private static async Task SeedOAuthAsync(DatamintDbContext db, IConfiguration config)
    {
        var defaultScopes = new (string Name, string DisplayName, string Description)[]
        {
            ("profile", "View your profile", "See your basic Datamint account information."),
            ("api.access", "Access the API on your behalf", "Call the Datamint API as you, within the limits of any other granted scopes.")
        };

        foreach (var (name, displayName, description) in defaultScopes)
        {
            if (await db.OAuthScopes.AnyAsync(s => s.Name == name)) continue;
            db.OAuthScopes.Add(new OAuthScope
            {
                Name = name,
                DisplayName = displayName,
                Description = description,
                IsDefault = true,
                IsEnabled = true
            });
        }
        await db.SaveChangesAsync();

        var apiBaseUrl = (config["App:ApiBaseUrl"] ?? "https://localhost:5001").TrimEnd('/');
        var swaggerRedirectUri = $"{apiBaseUrl}/swagger/oauth2-redirect.html";

        var swaggerClient = await db.OAuthClients
            .Include(c => c.RedirectUris).Include(c => c.Scopes)
            .FirstOrDefaultAsync(c => c.ClientId == SwaggerClientId);

        if (swaggerClient is null)
        {
            var scopes = await db.OAuthScopes.Where(s => defaultScopes.Select(d => d.Name).Contains(s.Name)).ToListAsync();
            db.OAuthClients.Add(new OAuthClient
            {
                ClientId = SwaggerClientId,
                Name = "Swagger UI",
                ClientSecretHash = null, // public client - PKCE is its authentication
                IsConfidential = false,
                RequireConsent = false, // first-party developer tooling, not a third-party app
                GrantTypes = OAuthGrantTypes.AuthorizationCode | OAuthGrantTypes.RefreshToken,
                AccessTokenLifetimeMinutes = 30,
                RefreshTokenLifetimeDays = 7,
                IsEnabled = true,
                RedirectUris = new List<OAuthRedirectUri> { new() { Uri = swaggerRedirectUri } },
                Scopes = scopes
            });
        }
        else if (!swaggerClient.RedirectUris.Any(r => r.Uri == swaggerRedirectUri))
        {
            swaggerClient.RedirectUris.Add(new OAuthRedirectUri { OAuthClientId = swaggerClient.Id, Uri = swaggerRedirectUri });
        }

        await db.SaveChangesAsync();
    }
}
