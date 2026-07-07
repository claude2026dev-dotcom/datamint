using Datamint.Domain.Entities;
using Datamint.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Persistence.Seed;

/// <summary>
/// Seeds a default admin user (change the password immediately after first
/// login — default is admin@datamint.local / ChangeMe123!) and three placeholder
/// plans so the Plans page + admin dashboard aren't empty on first run. Pricing
/// is a placeholder — edit from the admin dashboard once you've decided real numbers.
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
                IsEmailVerified = true
            });
        }

        if (!await db.Plans.AnyAsync())
        {
            db.Plans.AddRange(
                new Plan { Name = "Free", Price = 0, MonthlyUploadLimit = 2, BillingCycle = PlanBillingCycle.Monthly, Description = "Try Datamint with 2 free PDF extractions." },
                new Plan { Name = "Starter", Price = 0, MonthlyUploadLimit = 50, BillingCycle = PlanBillingCycle.Monthly, Description = "Placeholder price — set from Admin > Plans." },
                new Plan { Name = "Pro", Price = 0, MonthlyUploadLimit = -1, BillingCycle = PlanBillingCycle.Monthly, Description = "Unlimited uploads. Placeholder price — set from Admin > Plans." }
            );
        }

        await db.SaveChangesAsync();
    }
}
