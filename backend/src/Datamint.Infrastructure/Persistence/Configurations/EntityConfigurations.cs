using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Datamint.Infrastructure.Persistence.Configurations;

public class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> b)
    {
        b.HasIndex(u => u.Email).IsUnique();
        b.Property(u => u.Email).IsRequired().HasMaxLength(256);
        b.Property(u => u.Role).HasMaxLength(50);
    }
}

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.Property(a => a.Action).IsRequired().HasMaxLength(200);
        b.HasIndex(a => a.CreatedAtUtc);
        b.HasIndex(a => a.Action);
    }
}
