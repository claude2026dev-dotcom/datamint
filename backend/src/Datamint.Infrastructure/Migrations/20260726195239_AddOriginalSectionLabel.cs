using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOriginalSectionLabel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OriginalSectionLabel",
                table: "ExtractedFields",
                type: "nvarchar(max)",
                nullable: true);

            // Rows extracted before this column existed have no recorded original grouping -
            // backfill them to their own CURRENT section label (the closest available baseline,
            // same fallback pattern as AddOriginalSemanticType/BackfillOriginalSemanticType), so
            // "Restore sections" is a safe no-op for pre-existing documents instead of leaving
            // OriginalSectionLabel null (which RestoreSectionsAsync would otherwise interpret as
            // "General" and incorrectly regroup already-sectioned legacy data).
            migrationBuilder.Sql(@"
                UPDATE [ExtractedFields] SET [OriginalSectionLabel] = [SectionLabel] WHERE [OriginalSectionLabel] IS NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OriginalSectionLabel",
                table: "ExtractedFields");
        }
    }
}
