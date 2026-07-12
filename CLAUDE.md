# Datamint — Project Memory

## Stack
- Backend: .NET 8, C#, ASP.NET Core Web API, EF Core, SQL Server
- Frontend: Angular 18 (standalone components)
- Field extraction: **AI-based** (Claude or OpenAI, config-switchable) — unlike the sibling InvoiceApp project, which deliberately uses a non-AI heuristic
- Export: Excel via ClosedXML
- Email: SMTP via MailKit (account lifecycle emails, password reset, export delivery)
- Auth: JWT (access + refresh tokens) + Google OAuth (GSI button, ID-token flow)
- Payments: Razorpay (order create + server-side HMAC signature verification)
- Logging: Serilog (console + rolling file `logs/datamint-.log`)
- Architecture: Clean Architecture — `Datamint.Domain` / `Datamint.Application` / `Datamint.Infrastructure` / `Datamint.API`, each layer depending only on the one below it

## Working across two machines
This repo is worked on from both an office laptop and this personal laptop. **Always commit and push before switching machines** — there is no other sync mechanism. Before starting work in a fresh session on either machine, `git pull` / `git status` first to make sure you're starting from the latest pushed state, not stale local files.

## Project structure
```
datamint/
├── backend/
│   ├── Datamint.sln
│   └── src/
│       ├── Datamint.Domain/          # Entities (Document, ExtractedField, ApplicationUser, Subscription, Plan, AuditLog...), enums — no dependencies
│       ├── Datamint.Application/     # Interfaces, DTOs, DocumentProcessingService (the upload→extract→edit→export→email orchestrator)
│       ├── Datamint.Infrastructure/  # EF Core, ClaudeFieldExtractionService/OpenAiFieldExtractionService, MailKit, Razorpay, Google auth, migrations
│       └── Datamint.API/             # Controllers, Program.cs (DI wiring), appsettings, middleware
└── frontend/
    └── src/app/
        ├── core/                     # guards, interceptors, services (auth/document/subscription/admin), models
        ├── shared/components/        # navbar, toast, confirm-dialog, icon system, upload-progress
        └── features/                 # landing, auth (login/register/forgot-reset-password/google-callback), upload,
                                       # batch-review, preview-edit, subscription (plans/checkout), profile, admin, legal
```

## Extraction model
`DocumentProcessingService.ProcessDocumentAsync` (`Datamint.Application/Services/DocumentProcessingService.cs`) is the single orchestrator: `IPdfTextExtractionService` (PdfPig-based, `Datamint.Infrastructure/Services/PdfTextExtractionService.cs`) extracts per-page text (falling back to OCR — see "OCR" below — for scanned pages), then hands page text to `IAiFieldExtractionService`. Two interchangeable implementations exist side by side: `ClaudeFieldExtractionService` and `OpenAiFieldExtractionService`. The active one is a pure config switch — `AiProvider:Provider` = `"Claude"` or `"OpenAI"` in `appsettings.json` — picked once at DI registration time in `Program.cs`; nothing else in the app changes when you flip it.

Two extraction modes, chosen per-upload:
- **Dynamic** — AI extracts whatever key/value fields it finds, no field list given.
- **Formatted** — caller supplies a comma-separated `requestedFields` list; AI is asked to extract exactly those fields.

Extracted fields are individually editable (`PUT /api/documents/{id}/fields`, updates `FieldKey` and/or `FieldValue`, tracks `WasEditedByUser` by diffing against `OriginalAiValue`/`OriginalFieldKey`) before export/email — same "AI is best-effort, everything stays user-editable" philosophy as InvoiceApp, just with an AI extractor instead of a heuristic one.

**Multi-page extraction gotcha (fixed):** an earlier version conflated same-named fields found on different pages of the same document (see commit `c5643ae`). Field identity now needs to account for `PageNumber`, not just `FieldKey`, when merging AI results across pages — keep this in mind if touching `ExtractStructuredDataAsync` or the merge logic in `ProcessDocumentAsync`.

### OCR (partially stubbed)
Tesseract-based OCR is wired for the text-extraction path, but the actual PDF-page-to-image rasterization call (`RunOcrOnPage` in the Claude extraction service) is a marked `TODO` — needs a rasterizer library (`Docnet.Core`, `PdfiumViewer`, or shelling out to `pdftoppm`) plus a `tessdata/eng.traineddata` folder next to the API executable. Don't assume scanned-PDF extraction actually works end-to-end until this is filled in.

### Processing is synchronous on the request thread (known debt)
`DocumentsController.Upload` calls `ProcessDocumentAsync` inline, deliberately with `CancellationToken.None` (a dropped client connection must not abort extraction that's already running). This is scaffold-simplicity, not the intended production shape — moving this onto a background queue (Hangfire or an `IHostedService`) so uploads return instantly and the frontend's animated progress UI reflects real backend state (not a simulated timer) is an open item, not yet done.

## Access control / plan limits
- **Free tier:** 2 uploads before login required, enforced server-side by caller IP (`CountAnonymousUploadsByIpAsync`) — never trust a client-supplied counter for this.
- **Logged-in tier:** must have an `Active` `Subscription` with remaining monthly capacity (`UploadsUsedThisCycle` vs `Plan.MonthlyUploadLimit`, `-1` = unlimited). Both paths return HTTP 402 with `redirectTo: "/plans"` on limit-exceeded, not a generic error.
- **Document ownership:** a document tied to a `UserId` is only viewable/editable/exportable/emailable by that user. Anonymous (pre-login) documents are reachable by anyone with the GUID, matching the anonymous-upload flow. Deliberately, an anonymous visitor hitting someone else's owned document gets a "please sign in" prompt (401) while a *different logged-in* user gets the same 404 as a genuinely missing document — so a shared URL never confirms someone else's document exists. See `DocumentsController.GetOwnedDocumentAsync`.
- This ownership check was originally missing entirely (IDOR — any authenticated user could view/edit/export/email any other user's document by guessing its GUID) and was fixed in the 2026-07-06 validation pass. Don't regress it when touching document endpoints.

## Auth details worth knowing
- JWT access tokens are short-lived (~30 min) and self-expire, but `Program.cs`'s `OnTokenValidated` also does a live DB check every request (`SecurityStamp` match + `IsActive`/`IsDeleted`) so a password change, password reset, or admin disabling/deleting an account kills all of that user's access tokens immediately, not just at natural expiry.
- Real refresh-token rotation model exists (DB table + DTOs), "Remember Me" is wired.
- Google Sign-In is fully wired end-to-end (`shared/components/google-signin-button`) — both frontend `environment.googleClientId` and backend `GoogleAuth:ClientId` must be the **same** OAuth Web Client ID, with `http://localhost:4200` (and the real deployed domain later) as an Authorized JavaScript origin. No redirect URI needed for this flow.

## Non-negotiable rules
1. Application layer never references Infrastructure or Api directly — only interfaces.
2. Every external dependency (DB, AI API, email, payments, OAuth) is behind an interface in Application, implemented in Infrastructure — this is what lets `AiProvider:Provider` swap Claude/OpenAI with a one-line config change and nothing else in the app noticing.
3. No business logic in controllers — controllers call `DocumentProcessingService` / other Application services only.
4. Angular only communicates via typed HTTP services against documented API contracts — no direct DB or AI calls from frontend.
5. Secrets (JWT secret, DB connection string, Google/Claude/OpenAI/Razorpay/SMTP credentials) never hardcoded or committed. `backend/src/Datamint.API/appsettings.json` is gitignored; only `appsettings.json.example` (placeholders) is tracked. Use `dotnet user-secrets` locally, environment variables / a key vault in production.
6. Every login, upload, extraction, export, email-send, and admin action writes an `AuditLog` row via `IAuditService` — keep doing this for new mutating endpoints, it's how the admin audit-log viewer stays complete.
7. Soft-delete + ownership checks apply consistently — don't add a new entity/endpoint that bypasses the pattern already established for `Document`.

## EF Core gotcha (documented in code, worth repeating here)
In `DocumentProcessingService.ProcessDocumentAsync`, `document` comes from `GetWithDetailsAsync` on the same tracked `DbContext` — just mutate it and call `SaveChangesAsync`. **Never call `_documents.Update(document)`** in this method: `Update()` forces the entire tracked graph (including `DocumentPage`/`ExtractedField` children being added in the same call) from `Added` to `Modified`, so EF emits `UPDATE`s for child rows that don't exist yet → `DbUpdateConcurrencyException` (0 rows affected). Same underlying EF change-tracking class of bug as InvoiceApp's `AddExtractedFields` fix — new child entities need `AddRange`/tracked-`Added` state, not a blanket `Update()` on the parent.

## Config / secrets setup (per machine)
`appsettings.json` is gitignored and does **not** exist after a fresh clone — only `appsettings.json.example` is tracked. Each machine (office laptop, this personal laptop) needs its own real `appsettings.json` copied from the example and filled in (DB connection string, JWT secret, Google/Email/Claude-or-OpenAI/Razorpay credentials) — these are **not** synced via git and must be set up independently on each machine. Same for `frontend/.certs/` (local HTTPS dev cert, machine-specific) and `.claude/settings.local.json`.

**Default seeded admin:** `admin@datamint.local` / `ChangeMe123!` (via `DbSeeder.SeedAsync`, runs automatically on startup). Change immediately in any real deployment.

## Known accepted debt / open TODOs
- OCR page-rasterization (`RunOcrOnPage`) is a stub — see "OCR" above.
- Document processing runs inline on the upload request thread instead of a background queue — see "Processing is synchronous" above.
- Plan pricing is seeded as $0 placeholders — set real numbers from Admin → Plans before going live.
- `Razorpay` 3.1.0 NuGet package is .NET-Framework-targeted, restored via a compat shim (`NU1701` warning) — works, but there's no true .NET 8 build. Consider calling Razorpay's REST API directly via `HttpClient` instead if this becomes a real problem.
- No test project exists yet in this repo (unlike InvoiceApp's `tests/InvoiceApp.Infrastructure.Tests`) — extraction/auth/payment logic has so far only been validated via manual build + browser smoke-testing, not an automated suite.

## Validation history
**2026-07-06 pass** (static analysis + real build, no DB/API credentials available) found and fixed: nonexistent `PdfPig` NuGet version (swapped to the real package), a missing `Microsoft.Extensions.Logging.Abstractions` reference, the document-ownership IDOR described above, a no-op upload-limit check for logged-in users, a client-header-only (bypassable) anonymous free-tier limit, anonymous users being blocked from the review/export page they just used, a fake placeholder admin password hash, a known MailKit STARTTLS vulnerability (bumped 4.7.1.1 → 4.17.0), a plain `==` Razorpay signature compare (timing-attack surface on a payment path, switched to `CryptographicOperations.FixedTimeEquals`), a nonexistent default Claude model id, and missing favicon/assets references.

**2026-07-07 – 2026-07-09 (office laptop, per commit history):** Dynamic/Formatted extraction modes + editable field keys + batch preview/export; login error handling + profile/password-strength/document-privacy; Remember Me + real refresh tokens + AI self-verification; fixed multi-page extraction conflating same-named fields across pages (see "Extraction model" above); fixed admin pages breaking on error + a raw-entity leak in admin/plans; added professional admin dashboard + account lifecycle emails + self-service password/account management; fixed further critical extraction/auth bugs found via real-world testing + admin UX polish; replaced low-contrast emoji icons with a unified SVG icon system + responsiveness polish.

## Current phase
Picking this repo back up on a second machine (personal laptop) for the first time — previously worked only on the office laptop, all history is already pushed to `claude2026dev-dotcom/datamint` on GitHub (`master` branch). Local `appsettings.json`, HTTPS dev certs, and `.claude/settings.local.json` all need to be (re)created on this machine per "Config / secrets setup" above before the app can actually run here. No specific next task chosen yet as of this session.
