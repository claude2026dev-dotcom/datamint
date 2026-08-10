// Grants Azure SQL data-plane access (db_datareader/db_datawriter, optionally db_ddladmin) to a
// managed identity, using the same Authentication=Active Directory Default auth path the deployed
// app itself uses - authenticates via whatever az/azd credential is active on this machine.
//
// Exists because `az sql db query` is not a real Azure CLI command (a mistake carried over from
// a bad reference script) and the `rdbms-connect` extension only supports MySQL/PostgreSQL
// flexible servers, not Azure SQL Database - there is no `az` one-liner for this.
//
// Usage: dotnet run --project scripts/SqlGrant -- <server> <database> <principalName> <grantDdlAdmin:true|false>

using Microsoft.Data.SqlClient;

if (args.Length < 4)
{
    Console.Error.WriteLine("Usage: SqlGrant <server> <database> <principalName> <grantDdlAdmin:true|false>");
    return 1;
}

var server = args[0];
var database = args[1];
var principalName = args[2];
var grantDdlAdmin = string.Equals(args[3], "true", StringComparison.OrdinalIgnoreCase);

var escapedName = principalName.Replace("]", "]]");
var sql = $$"""
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = '{{principalName}}')
  CREATE USER [{{escapedName}}] FROM EXTERNAL PROVIDER;

IF NOT EXISTS (
  SELECT 1 FROM sys.database_role_members drm
  JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
  JOIN sys.database_principals m ON drm.member_principal_id = m.principal_id
  WHERE r.name = 'db_datareader' AND m.name = '{{principalName}}'
)
  ALTER ROLE db_datareader ADD MEMBER [{{escapedName}}];

IF NOT EXISTS (
  SELECT 1 FROM sys.database_role_members drm
  JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
  JOIN sys.database_principals m ON drm.member_principal_id = m.principal_id
  WHERE r.name = 'db_datawriter' AND m.name = '{{principalName}}'
)
  ALTER ROLE db_datawriter ADD MEMBER [{{escapedName}}];
""";

if (grantDdlAdmin)
{
    sql += $$"""

    IF NOT EXISTS (
      SELECT 1 FROM sys.database_role_members drm
      JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
      JOIN sys.database_principals m ON drm.member_principal_id = m.principal_id
      WHERE r.name = 'db_ddladmin' AND m.name = '{{principalName}}'
    )
      ALTER ROLE db_ddladmin ADD MEMBER [{{escapedName}}];
    """;
}

var connectionString = $"Server=tcp:{server},1433;Database={database};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connect Timeout=60;";

Console.WriteLine($"Granting SQL data-plane access to: {principalName} (ddladmin={grantDdlAdmin})");

try
{
    using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    using var command = new SqlCommand(sql, connection) { CommandTimeout = 60 };
    await command.ExecuteNonQueryAsync();
    Console.WriteLine("SQL access granted successfully.");
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"ERROR: {ex.Message}");
    return 1;
}
