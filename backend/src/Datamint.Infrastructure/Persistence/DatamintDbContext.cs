using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Persistence;

public class DatamintDbContext : DbContext
{
    public DatamintDbContext(DbContextOptions<DatamintDbContext> options) : base(options) { }

    public DbSet<ApplicationUser> Users => Set<ApplicationUser>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<EmailLog> EmailLogs => Set<EmailLog>();

    public DbSet<OAuthClient> OAuthClients => Set<OAuthClient>();
    public DbSet<OAuthScope> OAuthScopes => Set<OAuthScope>();
    public DbSet<OAuthRedirectUri> OAuthRedirectUris => Set<OAuthRedirectUri>();
    public DbSet<OAuthAuthorizationCode> OAuthAuthorizationCodes => Set<OAuthAuthorizationCode>();
    public DbSet<OAuthRefreshToken> OAuthRefreshTokens => Set<OAuthRefreshToken>();

    public DbSet<ExtractionTier> ExtractionTiers => Set<ExtractionTier>();
    public DbSet<RoleExtractionTierOverride> RoleExtractionTierOverrides => Set<RoleExtractionTierOverride>();
    public DbSet<UserExtractionTierOverride> UserExtractionTierOverrides => Set<UserExtractionTierOverride>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentPage> DocumentPages => Set<DocumentPage>();
    public DbSet<ExtractedField> ExtractedFields => Set<ExtractedField>();
    public DbSet<FieldTemplate> FieldTemplates => Set<FieldTemplate>();

    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DatamintDbContext).Assembly);

        // Global soft-delete filter: every query automatically skips IsDeleted rows.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(BaseEntity).IsAssignableFrom(entityType.ClrType))
            {
                var parameter = System.Linq.Expressions.Expression.Parameter(entityType.ClrType, "e");
                var property = System.Linq.Expressions.Expression.Property(parameter, nameof(BaseEntity.IsDeleted));
                var condition = System.Linq.Expressions.Expression.Lambda(System.Linq.Expressions.Expression.Not(property), parameter);
                modelBuilder.Entity(entityType.ClrType).HasQueryFilter(condition);
            }
        }
    }

    public override int SaveChanges()
    {
        UpdateTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        UpdateTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void UpdateTimestamps()
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Modified)
                entry.Entity.UpdatedAtUtc = DateTime.UtcNow;
        }
    }
}
