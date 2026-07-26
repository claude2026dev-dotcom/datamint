using Datamint.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Datamint.Infrastructure.Persistence.Configurations;

public class ExtractionTierConfiguration : IEntityTypeConfiguration<ExtractionTier>
{
    public void Configure(EntityTypeBuilder<ExtractionTier> b)
    {
        b.Property(t => t.Name).IsRequired().HasMaxLength(100);
        b.Property(t => t.ModelName).IsRequired().HasMaxLength(100);
        b.Property(t => t.CustomOutputFormatExample).HasMaxLength(4000);
        b.Property(t => t.CustomInstructions).HasMaxLength(4000);
    }
}

public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> b)
    {
        b.Property(d => d.OriginalFileName).IsRequired().HasMaxLength(500);
        b.Property(d => d.StoredFilePath).IsRequired().HasMaxLength(1000);
        b.Property(d => d.ContentType).IsRequired().HasMaxLength(200);
        b.Property(d => d.ExtractionMode).IsRequired().HasMaxLength(20);
        b.Property(d => d.RequestedFields).HasMaxLength(4000);
        b.HasIndex(d => d.UserId);
        b.HasIndex(d => d.UploadBatchId);

        b.HasOne(d => d.User).WithMany(u => u.Documents).HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
        // A tier can be deleted/deactivated later without breaking historical documents that
        // already recorded which tier processed them - SetNull, not Cascade/Restrict.
        b.HasOne(d => d.ExtractionTier).WithMany(t => t.Documents).HasForeignKey(d => d.ExtractionTierId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class DocumentPageConfiguration : IEntityTypeConfiguration<DocumentPage>
{
    public void Configure(EntityTypeBuilder<DocumentPage> b)
    {
        b.HasIndex(p => new { p.DocumentId, p.PageNumber }).IsUnique();
        b.HasOne(p => p.Document).WithMany(d => d.Pages).HasForeignKey(p => p.DocumentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ExtractedFieldConfiguration : IEntityTypeConfiguration<ExtractedField>
{
    public void Configure(EntityTypeBuilder<ExtractedField> b)
    {
        b.Property(f => f.FieldKey).IsRequired().HasMaxLength(300);
        b.Property(f => f.OriginalFieldKey).IsRequired().HasMaxLength(300);
        b.Property(f => f.FieldValue).HasMaxLength(4000);
        b.Property(f => f.OriginalAiValue).HasMaxLength(4000);
        b.Property(f => f.SemanticType).HasMaxLength(50);
        b.Property(f => f.SectionLabel).HasMaxLength(150);
        b.HasIndex(f => f.DocumentId);

        b.HasOne(f => f.Document).WithMany(d => d.ExtractedFields).HasForeignKey(f => f.DocumentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class FieldTemplateConfiguration : IEntityTypeConfiguration<FieldTemplate>
{
    public void Configure(EntityTypeBuilder<FieldTemplate> b)
    {
        b.Property(t => t.Name).IsRequired().HasMaxLength(150);
        b.Property(t => t.Fields).IsRequired().HasMaxLength(4000);
        b.HasIndex(t => t.UserId);

        b.HasOne(t => t.User).WithMany(u => u.FieldTemplates).HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
