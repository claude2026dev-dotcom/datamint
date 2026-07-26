using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Datamint.Infrastructure.Persistence.Configurations;

public class OAuthClientConfiguration : IEntityTypeConfiguration<OAuthClient>
{
    public void Configure(EntityTypeBuilder<OAuthClient> b)
    {
        b.HasIndex(c => c.ClientId).IsUnique();
        b.Property(c => c.ClientId).IsRequired().HasMaxLength(200);
        b.Property(c => c.Name).IsRequired().HasMaxLength(200);

        b.HasMany(c => c.RedirectUris)
            .WithOne(r => r.OAuthClient)
            .HasForeignKey(r => r.OAuthClientId)
            .OnDelete(DeleteBehavior.Cascade);

        // CreatedByUser deliberately does NOT cascade: ApplicationUser rows are never hard-deleted
        // in this app (see BaseEntity's soft-delete convention), but leaving this Cascade would
        // still make SQL Server reject the migration outright - it would create a second path from
        // ApplicationUser down to OAuthAuthorizationCode/OAuthRefreshToken (via OAuthClient) on top
        // of their own direct UserId cascade, which is exactly the "multiple cascade paths" pattern
        // SQL Server refuses to create at the DDL level, migration or not.
        b.HasOne(c => c.CreatedByUser)
            .WithMany()
            .HasForeignKey(c => c.CreatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // EF Core 8 implicit skip-navigation many-to-many - no explicit join entity class needed.
        // The soft-delete query filter on OAuthScope is automatically applied when EF materializes
        // client.Scopes, so a soft-deleted scope silently drops out of every client's list; the
        // stale join row is harmless and never surfaces.
        b.HasMany(c => c.Scopes)
            .WithMany(s => s.Clients)
            .UsingEntity(j => j.ToTable("OAuthClientScopes"));
    }
}

public class OAuthScopeConfiguration : IEntityTypeConfiguration<OAuthScope>
{
    public void Configure(EntityTypeBuilder<OAuthScope> b)
    {
        b.HasIndex(s => s.Name).IsUnique();
        b.Property(s => s.Name).IsRequired().HasMaxLength(100);
        b.Property(s => s.DisplayName).IsRequired().HasMaxLength(200);
    }
}

public class OAuthRedirectUriConfiguration : IEntityTypeConfiguration<OAuthRedirectUri>
{
    public void Configure(EntityTypeBuilder<OAuthRedirectUri> b)
    {
        b.Property(r => r.Uri).IsRequired().HasMaxLength(2000);
    }
}

public class OAuthAuthorizationCodeConfiguration : IEntityTypeConfiguration<OAuthAuthorizationCode>
{
    public void Configure(EntityTypeBuilder<OAuthAuthorizationCode> b)
    {
        b.HasIndex(a => a.CodeHash).IsUnique();
        b.HasIndex(a => a.ExpiresAtUtc);
        b.Property(a => a.CodeHash).IsRequired().HasMaxLength(200);
        b.Property(a => a.RedirectUri).IsRequired().HasMaxLength(2000);

        b.HasOne(a => a.OAuthClient).WithMany().HasForeignKey(a => a.OAuthClientId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class OAuthRefreshTokenConfiguration : IEntityTypeConfiguration<OAuthRefreshToken>
{
    public void Configure(EntityTypeBuilder<OAuthRefreshToken> b)
    {
        b.HasIndex(t => t.TokenHash).IsUnique();
        b.Property(t => t.TokenHash).IsRequired().HasMaxLength(200);

        b.HasOne(t => t.OAuthClient).WithMany().HasForeignKey(t => t.OAuthClientId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);

        // AuthorizationCodeId is deliberately left as a plain column, not a modeled EF
        // relationship - no navigation property exists for it, so EF's convention never turns
        // it into an FK constraint. It's a "soft" reference, matched via a Where() query in
        // OAuthService, that exists purely so a replayed code can find and revoke the refresh
        // token(s) it produced.
    }
}
