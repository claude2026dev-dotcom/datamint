using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOAuthAuthorizationCodeUsedAtUtc : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "UsedAtUtc",
                table: "OAuthAuthorizationCodes",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UsedAtUtc",
                table: "OAuthAuthorizationCodes");
        }
    }
}
