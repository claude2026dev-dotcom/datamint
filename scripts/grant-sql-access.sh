#!/bin/bash
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
#       posix:
#         shell: sh
#         run: ./scripts/grant-sql-access.sh
#
# ENVIRONMENT VARIABLES (sourced from azd env):
#   SQL_SERVER           - SQL server name (without .database.windows.net)
#   SQL_DATABASE         - Database name
#   SERVICE_API_NAME     - The API App Service name - this is the identity that actually needs
#                           SQL access (SERVICE_WEB_NAME is a Static Web App with no managed
#                           identity and no database access in this project).
#   SQL_GRANT_DDLADMIN   - Set to "true" to also grant db_ddladmin (needed for EF migrations)

set -e

# Safely load azd environment variables without eval
while IFS= read -r line; do
  [ -n "$line" ] || continue
  key=${line%%=*}
  value=${line#*=}
  case "$value" in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
  esac
  export "$key=$value"
done < <(azd env get-values)

if [ -z "$SERVICE_API_NAME" ]; then
  echo "ERROR: SERVICE_API_NAME is not set in azd environment." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRANT_DDLADMIN="${SQL_GRANT_DDLADMIN:-false}"

dotnet run --project "$SCRIPT_DIR/SqlGrant" -- "$SQL_SERVER" "$SQL_DATABASE" "$SERVICE_API_NAME" "$GRANT_DDLADMIN"

echo "SQL access granted successfully."
