using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Datamint.Infrastructure.Persistence.Configurations;

public class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> b)
    {
        b.Property(p => p.Name).IsRequired().HasMaxLength(100);
        b.Property(p => p.Description).HasMaxLength(1000);
        b.Property(p => p.Currency).IsRequired().HasMaxLength(10);
        b.Property(p => p.Price).HasColumnType("decimal(18,2)");
        b.Property(p => p.ProviderPlanId).HasMaxLength(200);

        // Same reasoning as Document.ExtractionTier - a tier can be deleted/deactivated later
        // without breaking a plan that already recorded which tier it maps to.
        b.HasOne(p => p.ExtractionTier).WithMany().HasForeignKey(p => p.ExtractionTierId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> b)
    {
        b.Property(s => s.ProviderSubscriptionId).HasMaxLength(200);
        b.Property(s => s.ProviderCustomerId).HasMaxLength(200);
        b.HasIndex(s => s.UserId);

        b.HasOne(s => s.User).WithMany(u => u.Subscriptions).HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        // A subscription must never disappear just because the plan it was purchased under is
        // later deleted/deactivated - Restrict, matching this app's "never lose payment/usage
        // history" rule; a plan can only be soft-deleted (IsActive=false), never hard-removed
        // while a subscription still references it.
        b.HasOne(s => s.Plan).WithMany(p => p.Subscriptions).HasForeignKey(s => s.PlanId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class PaymentTransactionConfiguration : IEntityTypeConfiguration<PaymentTransaction>
{
    public void Configure(EntityTypeBuilder<PaymentTransaction> b)
    {
        b.Property(t => t.Provider).IsRequired().HasMaxLength(50);
        b.Property(t => t.ProviderOrderId).IsRequired().HasMaxLength(200);
        b.Property(t => t.ProviderPaymentId).HasMaxLength(200);
        b.Property(t => t.ProviderSignature).HasMaxLength(500);
        b.Property(t => t.ProviderRefundId).HasMaxLength(200);
        b.Property(t => t.Currency).IsRequired().HasMaxLength(10);
        b.Property(t => t.Status).IsRequired().HasMaxLength(20);
        b.Property(t => t.Amount).HasColumnType("decimal(18,2)");
        b.Property(t => t.RefundAmount).HasColumnType("decimal(18,2)");
        b.HasIndex(t => t.UserId);
        b.HasIndex(t => t.ProviderOrderId).IsUnique();

        b.HasOne(t => t.User).WithMany(u => u.PaymentTransactions).HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
