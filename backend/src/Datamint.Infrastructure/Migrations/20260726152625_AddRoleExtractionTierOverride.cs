using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleExtractionTierOverride : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RoleExtractionTierOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ExtractionTierId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoleExtractionTierOverrides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoleExtractionTierOverrides_ExtractionTiers_ExtractionTierId",
                        column: x => x.ExtractionTierId,
                        principalTable: "ExtractionTiers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoleExtractionTierOverrides_ExtractionTierId",
                table: "RoleExtractionTierOverrides",
                column: "ExtractionTierId");

            migrationBuilder.CreateIndex(
                name: "IX_RoleExtractionTierOverrides_Role",
                table: "RoleExtractionTierOverrides",
                column: "Role",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoleExtractionTierOverrides");
        }
    }
}
