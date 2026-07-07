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

public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> b)
    {
        b.Property(d => d.OriginalFileName).IsRequired().HasMaxLength(500);
        b.Property(d => d.StoredFilePath).IsRequired().HasMaxLength(1000);
        b.HasMany(d => d.Pages).WithOne(p => p.Document).HasForeignKey(p => p.DocumentId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(d => d.ExtractedFields).WithOne(f => f.Document).HasForeignKey(f => f.DocumentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> b)
    {
        b.Property(p => p.Name).IsRequired().HasMaxLength(100);
        b.Property(p => p.Price).HasColumnType("decimal(10,2)");
    }
}

public class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> b)
    {
        b.HasOne(s => s.User).WithMany(u => u.Subscriptions).HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(s => s.Plan).WithMany(p => p.Subscriptions).HasForeignKey(s => s.PlanId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class PaymentTransactionConfiguration : IEntityTypeConfiguration<PaymentTransaction>
{
    public void Configure(EntityTypeBuilder<PaymentTransaction> b)
    {
        b.Property(t => t.Amount).HasColumnType("decimal(10,2)");
        b.Property(t => t.RazorpayOrderId).IsRequired().HasMaxLength(100);
        b.Property(t => t.Currency).HasMaxLength(10);
        b.Property(t => t.Status).HasMaxLength(30);
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
