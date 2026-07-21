using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Persistence.Seed;

/// <summary>
/// Seeds a default admin user (change the password immediately after first
/// login — default is admin@datamint.local / ChangeMe123!).
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(DatamintDbContext db)
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
    }
}
