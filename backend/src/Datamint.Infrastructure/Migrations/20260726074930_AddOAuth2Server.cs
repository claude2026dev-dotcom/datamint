using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOAuth2Server : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OAuthClients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClientId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ClientSecretHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LogoUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsConfidential = table.Column<bool>(type: "bit", nullable: false),
                    RequireConsent = table.Column<bool>(type: "bit", nullable: false),
                    GrantTypes = table.Column<int>(type: "int", nullable: false),
                    AccessTokenLifetimeMinutes = table.Column<int>(type: "int", nullable: false),
                    RefreshTokenLifetimeDays = table.Column<int>(type: "int", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthClients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OAuthClients_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "OAuthScopes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthScopes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OAuthAuthorizationCodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CodeHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OAuthClientId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RedirectUri = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Scope = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CodeChallenge = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CodeChallengeMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Used = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthAuthorizationCodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OAuthAuthorizationCodes_OAuthClients_OAuthClientId",
                        column: x => x.OAuthClientId,
                        principalTable: "OAuthClients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OAuthAuthorizationCodes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OAuthRedirectUris",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OAuthClientId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Uri = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthRedirectUris", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OAuthRedirectUris_OAuthClients_OAuthClientId",
                        column: x => x.OAuthClientId,
                        principalTable: "OAuthClients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OAuthRefreshTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TokenHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OAuthClientId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Scope = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AuthorizationCodeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Revoked = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthRefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OAuthRefreshTokens_OAuthClients_OAuthClientId",
                        column: x => x.OAuthClientId,
                        principalTable: "OAuthClients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OAuthRefreshTokens_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OAuthClientScopes",
                columns: table => new
                {
                    ClientsId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScopesId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OAuthClientScopes", x => new { x.ClientsId, x.ScopesId });
                    table.ForeignKey(
                        name: "FK_OAuthClientScopes_OAuthClients_ClientsId",
                        column: x => x.ClientsId,
                        principalTable: "OAuthClients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OAuthClientScopes_OAuthScopes_ScopesId",
                        column: x => x.ScopesId,
                        principalTable: "OAuthScopes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OAuthAuthorizationCodes_CodeHash",
                table: "OAuthAuthorizationCodes",
                column: "CodeHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OAuthAuthorizationCodes_ExpiresAtUtc",
                table: "OAuthAuthorizationCodes",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthAuthorizationCodes_OAuthClientId",
                table: "OAuthAuthorizationCodes",
                column: "OAuthClientId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthAuthorizationCodes_UserId",
                table: "OAuthAuthorizationCodes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthClients_ClientId",
                table: "OAuthClients",
                column: "ClientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OAuthClients_CreatedByUserId",
                table: "OAuthClients",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthClientScopes_ScopesId",
                table: "OAuthClientScopes",
                column: "ScopesId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthRedirectUris_OAuthClientId",
                table: "OAuthRedirectUris",
                column: "OAuthClientId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthRefreshTokens_OAuthClientId",
                table: "OAuthRefreshTokens",
                column: "OAuthClientId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthRefreshTokens_TokenHash",
                table: "OAuthRefreshTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OAuthRefreshTokens_UserId",
                table: "OAuthRefreshTokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_OAuthScopes_Name",
                table: "OAuthScopes",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OAuthAuthorizationCodes");

            migrationBuilder.DropTable(
                name: "OAuthClientScopes");

            migrationBuilder.DropTable(
                name: "OAuthRedirectUris");

            migrationBuilder.DropTable(
                name: "OAuthRefreshTokens");

            migrationBuilder.DropTable(
                name: "OAuthScopes");

            migrationBuilder.DropTable(
                name: "OAuthClients");
        }
    }
}
