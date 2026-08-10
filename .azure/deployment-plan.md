# Azure Deployment Plan

> **Status:** Deployed

Live and verified end-to-end:
- API: https://datamint-api-4gszcm.azurewebsites.net/ (`/health` → 200, `/api/version` → `2.0.0`, `/api/subscription/plans` → real DB-backed response)
- Frontend: https://proud-tree-0fd6f0f00.7.azurestaticapps.net/ (loads, correctly calls the live API)
- Database: `datamint-sql-4gszcm` / `DatamintDb`, Entra-only auth, EF Core migrations applied, queryable via the app's managed identity

**Real issues hit and fixed during deployment (documented for future reference, not just for this run):**
1. `az sql db query` is not a real Azure CLI command, and the `rdbms-connect` extension only supports MySQL/PostgreSQL flexible servers, not Azure SQL Database - replaced with `scripts/SqlGrant`, a tiny dotnet console tool using `Microsoft.Data.SqlClient` + `Authentication=Active Directory Default` (the same auth path the deployed app itself uses).
2. The postprovision script's identity-priority logic (copied from a generic reference pattern) defaulted to `SERVICE_WEB_NAME` - wrong for this project, since `web` is a Static Web App with no managed identity/database access. Fixed to always target `SERVICE_API_NAME`.
3. Windows PowerShell 5.1 promotes a native command's stderr to a terminating error under `$ErrorActionPreference = 'Stop'` even when redirected - broke the `rdbms-connect` extension-install check. Fixed by using `'Continue'` + explicit `$LASTEXITCODE` checks throughout.
4. The web service's `predeploy` hook patched `environment.prod.ts` too late - `azd` runs packaging (`npm run build`) *before* `predeploy`, so the stale placeholder API URL was already compiled into the bundle. Moved the patch to a `prepackage` hook instead.
5. `shell: sh` doesn't exist on Windows - needed the same `posix`/`windows` split already used for the `postprovision` hook.

Generated: 2026-08-10

---

## 1. Project Overview

**Goal:** Host and maintain the existing Datamint app (PDF/image upload → AI field extraction → review → export, with subscriptions/admin) on Azure, staying strictly within Azure's **Always-Free** tier — no paid SKUs, no trial-credit spend.

**Path:** Add Components (existing app, no prior Azure deployment)

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Staging / Demo (explicitly not production-grade) |
| Scale | Small (single instance, no autoscale — F1 doesn't support it) |
| Budget | **$0 — Always-Free tier only**, do not consume trial credit |
| **Subscription** | "Azure subscription 1" (`fb20d6d8-2cfb-4f4f-a925-6ec166aa8e41`) ✅ confirmed |
| **Location** | `centralindia` (API + DB + Key Vault) + `eastasia` (Static Web App — SWA free tier isn't available in centralindia) — ⚠️ **pending final user confirmation** |

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| Datamint.API | API | .NET 8 Web API (Clean Architecture: Domain/Application/Infrastructure/API), EF Core → SQL Server | `backend/src/Datamint.API` |
| Datamint frontend | Frontend | Angular 18, standalone components | `frontend/` |
| Database | Data | SQL Server (currently LocalDB locally) | EF Core migrations under `backend/src/Datamint.Infrastructure/Migrations` |

No existing `azure.yaml`, Dockerfile, or IaC files found — clean slate.

---

## 4. Recipe Selection

**Selected:** AZD (Bicep)

**Rationale:**
- Default recipe per skill guidance; no existing Terraform/Bicep/az-script tooling to preserve.
- Multi-service app (API + static frontend + DB) — AZD's `azure.yaml` service composition fits directly.
- Simplest path to `azd up` / `azd deploy` for ongoing maintenance, which the user explicitly wants ("host **and maintain**").

---

## 5. Architecture

**Stack:** Azure App Service (PaaS, not containers) + Azure Static Web Apps + Azure SQL Database

### Service Mapping

| Component | Azure Service | SKU |
|-----------|---------------|-----|
| Datamint.API | App Service (Linux, .NET 8) | **F1 (Free)** |
| Angular frontend | Static Web Apps | **Free** |
| Database | Azure SQL Database | **Free offer** — serverless, Entra-only auth, auto-pause (1 per subscription; this subscription has none provisioned) |
| Secrets | Key Vault | Standard (no separate "free SKU" — first 10,000 operations/month are free, which this app's traffic will stay well under) |

### Supporting Services

| Service | Purpose |
|---------|---------|
| Managed Identity (System-assigned on App Service) | Passwordless auth to Key Vault + SQL Database — no admin login/password anywhere (Entra-only, per Azure security best practice) |
| Application Insights | **Not included** — F1 tier + free-tier goal; app already has file-based Serilog logging, which stays as-is. Can be added later at zero extra infra cost if wanted (Application Insights has its own free monthly data allowance), flagged as an optional follow-up, not part of this pass. |

### Secrets Inventory (→ Key Vault, referenced by App Service via Managed Identity — never hardcoded, never committed)

| Secret | Source today (local, gitignored) |
|--------|-----------------------------------|
| `Jwt--Secret` | `appsettings.json` → `Jwt:Secret` |
| `Email--Password` | `appsettings.json` → `Email:Password` (SMTP app password) |
| `Claude--ApiKey` | `appsettings.json` → `Claude:ApiKey` |
| `OpenAI--ApiKey` | `appsettings.json` → `OpenAI:ApiKey` |

Not secret (plain App Settings, not Key Vault): `GoogleAuth:ClientId` (public by design), `App:*` branding config.

**Database connection:** Entra-only (no `administratorLogin`/password per skill rule #10) — App Service's managed identity is granted SQL access directly; no connection-string secret needed for the DB itself.

**Payments:** Stays on the existing `FakePaymentService` (`Payment:Provider = "Fake"`) for this staging deployment — real Razorpay keys aren't in scope unless you want live payments tested, which I'd flag as a separate step since it involves real financial credentials.

**File storage:** `FileStorage:UploadsRootPath` will point at App Service's persistent `/home` path (not the app's working directory, which resets on every deploy) — single-instance F1 has no scale-out, so this is safe for staging. *(Not moving to Blob Storage for this pass — an extra free-tier-eligible service, but adds scope; flagging as a clean future upgrade, not doing it now unless you want it.)*

---

## 6. Provisioning Limit Checklist

### Phase 1: Resource Inventory

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---------------|-------------------|--------------------------|--------------|-------|
| `Microsoft.Web/serverfarms` (F1) | 1 | 1 | N/A — not quota-tracked | See Phase 2 |
| `Microsoft.Web/sites` (API) | 1 | 1 | N/A — not quota-tracked | See Phase 2 |
| `Microsoft.Web/staticSites` (frontend) | 1 | 1 | Not quota-tracked; SWA free tier is region-restricted, not count-restricted | See Phase 2 |
| `Microsoft.Sql/servers` + 1 free DB | 1 server / 1 DB | 1 / 1 | **1 free DB per subscription** | See Phase 2 |
| `Microsoft.KeyVault/vaults` | 1 | 1 | Hundreds per region (not a practical constraint) | See Phase 2 |

### Phase 2: Quota Validation (actual data, no `_TBD_`)

| Resource Type | Total After Deployment | Limit/Quota | Notes |
|---------------|--------------------------|--------------|-------|
| `Microsoft.Web/serverfarms` (F1) | 1 | Not quota-applicable | Fetched from: `az quota list --scope .../Microsoft.Web/locations/centralindia` → `"isQuotaApplicable": false` for the only tracked dimension ("Total Regional VMs") — F1 uses shared multi-tenant compute, not dedicated VM capacity, so no quota blocks it. |
| `Microsoft.Web/sites` (API) | 1 | Not quota-applicable | Same as above — App Service site count isn't tracked via `Microsoft.Quota`. |
| `Microsoft.Web/staticSites` (frontend) | 1 | Not quota-tracked by `Microsoft.Quota`; region-restricted instead (see §2 Location) | `Microsoft.Web` quota API doesn't expose a separate SWA count limit; official docs confirm the constraint is region availability, not a per-subscription cap. |
| `Microsoft.Sql/servers` + free DB | 1 / 1 | **1 free database per subscription** (hard product limit) | Fetched from: Official docs — `az quota list` returns `BadRequest` for `Microsoft.Sql` (provider doesn't support the Microsoft.Quota RP; confirmed after registering the provider, so this isn't a registration gap). This subscription currently has **zero** resource groups / SQL servers, so the 1-free-DB budget is available. |
| `Microsoft.KeyVault/vaults` | 1 | Not a practical constraint (100s per region) | Official docs — no quota CLI check needed for a single vault. |

**Status:** ✅ All resources within limits — every resource in this plan fits inside Azure's Always-Free allowances for a brand-new subscription with zero existing resources.

**Caveat (documented honestly, not silently glossed over):** Azure's SQL Database free offer is a specific, sometimes region/subscription-gated promotional SKU. If provisioning it fails (e.g., not yet enabled for this exact free-trial subscription type), I will **stop and tell you** rather than silently falling back to a paid SQL tier — at that point the honest options would be: (a) request the free offer be enabled via Azure support, or (b) use SQLite/a file-based DB for this staging deployment instead of SQL Server (a real architecture change I would NOT make without asking first).

---

## 7. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace
- [x] Gather requirements
- [x] Confirm subscription and location with user — confirmed: centralindia (API/SQL/KeyVault) + eastasia (SWA)
- [x] Prepare resource inventory
- [x] Fetch quotas and validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [x] **User approved this plan**

### Phase 2: Execution
- [x] Research components (App Service/SQL/Key Vault Bicep patterns, azd recipe, SQL grant-access hook)
- [x] Generate infrastructure files (`infra/main.bicep`, `infra/modules/resources.bicep`, Entra-only SQL, managed identity wiring)
- [x] Generate `azure.yaml` (api on appservice, web on staticwebapp with predeploy hook)
- [x] Generate application configuration changes (Key Vault references via App Settings, Entra connection string, `/home/uploads` path, `/health` endpoint)
- [x] Update plan status to "Ready for Validation"

### Phase 3: Validation
- [x] Invoke azure-validate skill
  - [x] AZD Installation — `azd version 1.30.0`
  - [x] Schema Validation — `azd show` parses both services correctly
  - [x] Environment Setup — `datamint-prod-hrel` created
  - [x] Authentication Check — `azd auth login` (device code), confirmed via `--check-status`
  - [x] Subscription/Location Check — set via `azd env set`
  - [x] Provision Preview — `azd provision --preview --no-prompt` succeeded
  - [x] Build Verification — `dotnet build` + `ng build` clean on develop/qa/master
  - [x] Package Validation — `azd package --no-prompt` succeeded for both services
  - [x] Azure Policy Validation — only policy is a West Europe region block; unaffected (using centralindia/eastasia)
- [x] All validation checks pass
- [x] Update plan status to "Validated"
- [x] Record validation proof below

### Phase 4: Deployment
- [ ] Invoke azure-deploy skill
- [ ] Report deployed endpoint URLs

---

## 7b. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| AZD installed | `azd version` | ✅ 1.30.0 | 2026-08-10 |
| azd/az authenticated | `az login` + `azd auth login` (both device-code), `azd auth login --check-status` | ✅ claude2026dev@gmail.com | 2026-08-10 |
| azd environment | `azd env new datamint-prod-hrel` | ✅ created, set as default | 2026-08-10 |
| Subscription/location | `azd env set AZURE_SUBSCRIPTION_ID/AZURE_LOCATION/AZURE_SWA_LOCATION`, `azd env get-values` | ✅ centralindia / eastasia | 2026-08-10 |
| SQL Entra admin principal | `az ad signed-in-user show`, `azd env set AZURE_PRINCIPAL_ID/NAME` | ✅ "DataMint Project" | 2026-08-10 |
| Secrets seeded | `node scripts/seed-azd-secrets.js` | ✅ JWT/Email/Claude keys set (not printed); OpenAI left as placeholder (not configured locally) | 2026-08-10 |
| azure.yaml schema | `azd show` | ✅ both services (api, web) parsed correctly | 2026-08-10 |
| Bicep provision preview | `azd provision --preview --no-prompt` | ✅ 6 resources planned (RG, Key Vault, SQL Server, App Service plan, Web App, Static Web App), no errors | 2026-08-10 |
| Backend build | `dotnet build` (develop/qa/master) | ✅ 0 errors | 2026-08-10 |
| Frontend build | `ng build --configuration production` / `qa` (develop/qa/master) | ✅ 0 errors | 2026-08-10 |
| Package validation | `azd package --no-prompt` | ✅ both services packaged | 2026-08-10 |
| Azure Policy check | `mcp_azure_mcp_policy policy_assignment_list` | ✅ only a West Europe region-block policy exists; unaffected (using centralindia/eastasia) | 2026-08-10 |

**Validated by:** azure-validate skill
**Validation timestamp:** 2026-08-10

---

## 8. Files to Generate

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | This plan | ✅ |
| `azure.yaml` | AZD configuration | ✅ |
| `infra/main.bicep` + modules | App Service, SQL (Entra-only), Key Vault, managed identity role assignments | ✅ |
| `frontend/staticwebapp.config.json` | SWA routing config (SPA fallback) | ✅ |

---

## 9. Next Steps

> Current: Validated — proceeding to azure-deploy

1. Invoke azure-deploy skill to run the real provision + deploy.
2. Report deployed endpoint URLs back to the user.
