# Azure Deployment Plan

> **Status:** Planning — awaiting user approval

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
- [ ] Confirm subscription and location with user ⚠️ **awaiting confirmation on the two-region split (centralindia + eastasia)**
- [x] Prepare resource inventory
- [x] Fetch quotas and validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [ ] **User approved this plan**

### Phase 2: Execution
- [ ] Research components (load references, invoke skills)
- [ ] Generate infrastructure files (`infra/*.bicep`, Entra-only SQL, managed identity wiring)
- [ ] Generate `azure.yaml`
- [ ] Generate application configuration changes (Key Vault references, connection string → Entra auth, `/home`-based upload path)
- [ ] Update plan status to "Ready for Validation"

### Phase 3: Validation
- [ ] Invoke azure-validate skill

### Phase 4: Deployment
- [ ] Invoke azure-deploy skill
- [ ] Report deployed endpoint URLs

---

## 8. Files to Generate

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | This plan | ✅ |
| `azure.yaml` | AZD configuration | ⏳ |
| `infra/main.bicep` + modules | App Service, SQL (Entra-only), Key Vault, managed identity role assignments | ⏳ |
| `frontend/staticwebapp.config.json` | SWA routing config (API proxy, SPA fallback) | ⏳ |

---

## 9. Next Steps

> Current: Phase 1 complete, plan presented for approval

1. Get your confirmation on the region split (or your preferred alternative).
2. On approval, generate Bicep + `azure.yaml`, wire Entra-only SQL auth and Key Vault into the .NET app config.
3. Hand off to azure-validate, then azure-deploy.
