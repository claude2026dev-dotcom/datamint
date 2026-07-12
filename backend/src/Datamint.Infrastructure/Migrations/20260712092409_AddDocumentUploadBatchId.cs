using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentUploadBatchId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NEWID() (not a fixed defaultValue) is deliberate: it's evaluated per-row by
            // SQL Server during this ALTER TABLE, so every pre-existing document gets its
            // own unique batch id. A single shared default would have made every document
            // ever uploaded - across every user - look like one giant shared upload batch.
            migrationBuilder.AddColumn<Guid>(
                name: "UploadBatchId",
                table: "Documents",
                type: "uniqueidentifier",
                nullable: false,
                defaultValueSql: "NEWID()");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UploadBatchId",
                table: "Documents");
        }
    }
}
