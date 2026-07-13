using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GenericizePaymentProviderNaming : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "RazorpaySubscriptionId",
                table: "Subscriptions",
                newName: "ProviderSubscriptionId");

            migrationBuilder.RenameColumn(
                name: "RazorpayCustomerId",
                table: "Subscriptions",
                newName: "ProviderCustomerId");

            migrationBuilder.RenameColumn(
                name: "RazorpayPlanId",
                table: "Plans",
                newName: "ProviderPlanId");

            migrationBuilder.RenameColumn(
                name: "RazorpaySignature",
                table: "PaymentTransactions",
                newName: "ProviderSignature");

            migrationBuilder.RenameColumn(
                name: "RazorpayPaymentId",
                table: "PaymentTransactions",
                newName: "ProviderPaymentId");

            migrationBuilder.RenameColumn(
                name: "RazorpayOrderId",
                table: "PaymentTransactions",
                newName: "ProviderOrderId");

            // Existing rows predate the multi-provider switch and were all processed by
            // Razorpay (the only provider that existed before this migration) - backfilled
            // accordingly rather than left blank, so transaction history stays accurate.
            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "PaymentTransactions",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Razorpay");

            migrationBuilder.AddColumn<string>(
                name: "ProviderRefundId",
                table: "PaymentTransactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RefundAmount",
                table: "PaymentTransactions",
                type: "decimal(10,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RefundReason",
                table: "PaymentTransactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RefundedAtUtc",
                table: "PaymentTransactions",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Provider",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "ProviderRefundId",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "RefundAmount",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "RefundReason",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "RefundedAtUtc",
                table: "PaymentTransactions");

            migrationBuilder.RenameColumn(
                name: "ProviderSubscriptionId",
                table: "Subscriptions",
                newName: "RazorpaySubscriptionId");

            migrationBuilder.RenameColumn(
                name: "ProviderCustomerId",
                table: "Subscriptions",
                newName: "RazorpayCustomerId");

            migrationBuilder.RenameColumn(
                name: "ProviderPlanId",
                table: "Plans",
                newName: "RazorpayPlanId");

            migrationBuilder.RenameColumn(
                name: "ProviderSignature",
                table: "PaymentTransactions",
                newName: "RazorpaySignature");

            migrationBuilder.RenameColumn(
                name: "ProviderPaymentId",
                table: "PaymentTransactions",
                newName: "RazorpayPaymentId");

            migrationBuilder.RenameColumn(
                name: "ProviderOrderId",
                table: "PaymentTransactions",
                newName: "RazorpayOrderId");
        }
    }
}
