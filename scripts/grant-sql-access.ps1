# Grant Azure SQL data-plane access to the API's managed identity.
#
# Runs scripts/SqlGrant (a tiny dotnet console tool using Microsoft.Data.SqlClient with
# Authentication=Active Directory Default - the same auth path the deployed app itself uses).
# `az sql db query` does not exist, and the `rdbms-connect` CLI extension only supports
# MySQL/PostgreSQL flexible servers, not Azure SQL Database - there is no `az` one-liner for this.
#
# Called as a postprovision hook from azure.yaml:
#   hooks:
#     postprovision:
#       windows:
#         shell: pwsh
#         run: ./scripts/grant-sql-access.ps1
#
# ENVIRONMENT VARIABLES (sourced from azd env):
#   SQL_SERVER           - SQL server name (without .database.windows.net)
#   SQL_DATABASE         - Database name
#   SERVICE_API_NAME     - The API App Service name - this is the identity that actually needs
#                           SQL access (SERVICE_WEB_NAME is a Static Web App with no managed
#                           identity and no database access in this project, deliberately NOT
#                           used here even though it's the generic reference pattern's default).
#   SQL_GRANT_DDLADMIN   - Set to "true" to also grant db_ddladmin (needed for EF migrations)

# Deliberately NOT $ErrorActionPreference = 'Stop': in Windows PowerShell 5.1, a native exe's
# stderr output (even non-fatal warnings) becomes a terminating error under -Stop regardless of
# output redirection. Native commands below are checked explicitly via $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'

# Load azd environment variables
azd env get-values | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    Set-Item "env:$name" $value.Trim('"')
}

if (-not $env:SERVICE_API_NAME) {
    Write-Error "ERROR: SERVICE_API_NAME is not set in azd environment."
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$grantDdlAdmin = if ($env:SQL_GRANT_DDLADMIN -eq 'true') { 'true' } else { 'false' }

dotnet run --project "$scriptDir\SqlGrant" -- $env:SQL_SERVER $env:SQL_DATABASE $env:SERVICE_API_NAME $grantDdlAdmin

if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: SqlGrant tool failed with exit code $LASTEXITCODE."
    exit 1
}
