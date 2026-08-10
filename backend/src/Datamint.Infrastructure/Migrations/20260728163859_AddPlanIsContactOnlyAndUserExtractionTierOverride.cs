using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanIsContactOnlyAndUserExtractionTierOverride : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsContactOnly",
                table: "Plans",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "UserExtractionTierOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExtractionTierId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserExtractionTierOverrides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserExtractionTierOverrides_ExtractionTiers_ExtractionTierId",
                        column: x => x.ExtractionTierId,
                        principalTable: "ExtractionTiers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserExtractionTierOverrides_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserExtractionTierOverrides_ExtractionTierId",
                table: "UserExtractionTierOverrides",
                column: "ExtractionTierId");

            migrationBuilder.CreateIndex(
                name: "IX_UserExtractionTierOverrides_UserId",
                table: "UserExtractionTierOverrides",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserExtractionTierOverrides");

            migrationBuilder.DropColumn(
                name: "IsContactOnly",
                table: "Plans");
        }
    }
}
