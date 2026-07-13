using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFieldSemanticTypeSectionAndExportToggle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludeInExport",
                table: "ExtractedFields",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "SectionLabel",
                table: "ExtractedFields",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SemanticType",
                table: "ExtractedFields",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IncludeInExport",
                table: "ExtractedFields");

            migrationBuilder.DropColumn(
                name: "SectionLabel",
                table: "ExtractedFields");

            migrationBuilder.DropColumn(
                name: "SemanticType",
                table: "ExtractedFields");
        }
    }
}
