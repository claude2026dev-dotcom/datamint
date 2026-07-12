using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenamePlanQuotaToPages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "UploadsUsedThisCycle",
                table: "Subscriptions",
                newName: "PagesUsedThisCycle");

            migrationBuilder.RenameColumn(
                name: "MonthlyUploadLimit",
                table: "Plans",
                newName: "MonthlyPageLimit");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "PagesUsedThisCycle",
                table: "Subscriptions",
                newName: "UploadsUsedThisCycle");

            migrationBuilder.RenameColumn(
                name: "MonthlyPageLimit",
                table: "Plans",
                newName: "MonthlyUploadLimit");
        }
    }
}
