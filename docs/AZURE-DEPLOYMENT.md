# Azure hosting

Datamint runs on Azure entirely within the **Always-Free** tier: App Service (Linux, F1) for
the API, Static Web Apps (Free) for the Angular frontend, Azure SQL Database's free offer
(serverless, auto-pause, Entra-only auth - no admin password anywhere), and Key Vault for
secrets. See `.azure/deployment-plan.md` for the full plan, quota validation, and rationale.

## Prerequisites (per machine)

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`) - `az login`
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (`azd`)
- A real, filled-in `backend/src/Datamint.API/appsettings.json` (see "Config / secrets setup"
  in the root `CLAUDE.md`) - this is where deployment pulls the real JWT secret, SMTP
  password, and Claude/OpenAI API keys from.

## First-time setup (one azd environment, e.g. `prod`)

```bash
azd auth login          # if `az login` alone isn't enough for azd
azd env new prod
azd env set AZURE_LOCATION centralindia
azd env set AZURE_SWA_LOCATION eastasia   # Static Web Apps free tier isn't available in centralindia

# Sets AZURE_PRINCIPAL_ID / AZURE_PRINCIPAL_NAME - required for the SQL Entra admin
PRINCIPAL_INFO=$(az ad signed-in-user show --query "{id:id, name:displayName}" -o json)
azd env set AZURE_PRINCIPAL_ID $(echo $PRINCIPAL_INFO | jq -r '.id')
azd env set AZURE_PRINCIPAL_NAME $(echo $PRINCIPAL_INFO | jq -r '.name')

# Pushes local appsettings.json secrets into this azd environment (never printed, never committed)
node scripts/seed-azd-secrets.js
azd env set SQL_GRANT_DDLADMIN true   # the app auto-runs EF Core migrations at startup

azd provision --preview   # review the plan
azd provision              # create the real resources
azd deploy                 # build + deploy both services
```

`azd up` runs `provision` + `deploy` together, but the `AZURE_PRINCIPAL_ID`/`SQL_GRANT_DDLADMIN`
env vars above must be set **before** the first `azd provision` regardless.

## Redeploying after a code change

```bash
azd deploy            # both services
azd deploy api         # backend only
azd deploy web         # frontend only
```

## Known free-tier caveats

- **App Service F1**: 60 CPU-minutes/day, 1GB storage, no custom domain/TLS binding, no "Always
  On" (the app may cold-start after idle periods - fine for staging/demo, not production).
- **Azure SQL free offer**: one free database per subscription, 100K vCore-seconds + 32GB/month.
  If usage exceeds that in a month, the database auto-pauses until the next billing cycle
  (`freeLimitExhaustionBehavior: AutoPause` in `infra/modules/resources.bicep`) rather than
  silently billing you.
- **Google Sign-In**: works once `GoogleAuth:ClientId` matches the real value seeded from
  `appsettings.json` - already wired via `seed-azd-secrets.js`.
- **Payments**: this deployment keeps `Payment:Provider = Fake` - wiring real Razorpay keys is
  a separate step (not done here, since it's a "real money" decision).

## Checking what's actually running

```bash
azd env get-values | grep -E "API_URL|WEB_URL"
curl https://<api-url>/api/version
curl https://<api-url>/health
```

Or via the portal: resource group `rg-<environment-name>` in subscription "Azure subscription 1".
