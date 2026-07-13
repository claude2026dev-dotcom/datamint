using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBillingEmailTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryAlertSentAtUtc",
                table: "Subscriptions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AbandonedCheckoutEmailSentAtUtc",
                table: "PaymentTransactions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PlanId",
                table: "PaymentTransactions",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExpiryAlertSentAtUtc",
                table: "Subscriptions");

            migrationBuilder.DropColumn(
                name: "AbandonedCheckoutEmailSentAtUtc",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "PlanId",
                table: "PaymentTransactions");
        }
    }
}
