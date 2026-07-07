# Datamint

AI-powered PDF data extraction platform — upload PDFs (digital or scanned), extract
structured key/value data with Claude, review/edit results, export to Excel, and
email the export. Subscription-gated with a 2-upload free tier, Google/email auth,
Razorpay billing, and an admin dashboard with full audit logging.

**Stack:** .NET 8 (Clean Architecture) · Angular 18 (standalone components) · SQL Server · MailKit · Claude API · Razorpay · Google OAuth

---

## ✅ Validation pass (2026-07-06)

This codebase has since been actually built and fixed, not just reviewed on paper:
`dotnet build` succeeds across all 4 backend projects, `ng build --configuration
production` succeeds, and the landing/upload/plans pages were smoke-tested in a
browser. Bugs found and fixed in that pass:
- `UglyToad.PdfPig 0.1.9` doesn't exist on NuGet (that package id now points to an
  unrelated, oddly-versioned package) — swapped to the real, actively maintained
  `PdfPig` package.
- `Datamint.Application` used `ILogger<T>` without referencing
  `Microsoft.Extensions.Logging.Abstractions` — added.
- **IDOR:** any authenticated user could view/edit/export/email any other user's
  document by guessing its GUID — endpoints now check document ownership.
- Logged-in users' upload limits were literally a no-op comment — real plan-limit
  enforcement now runs in `DocumentsController.Upload`.
- Anonymous free-tier limit was enforced only via a client-supplied header
  (trivially bypassable) — now enforced server-side by IP.
- Anonymous users could upload but could never reach the review/export page
  (route + endpoints required login) — removed that barrier for unowned documents.
- Seeded admin account had a fake placeholder password hash — now a real BCrypt
  hash for `ChangeMe123!`.
- `MailKit 4.7.1.1` had a known STARTTLS response-injection vulnerability —
  bumped to `4.17.0`.
- Razorpay signature verification used a plain `==` string compare (timing-attack
  surface on a payment path) — switched to `CryptographicOperations.FixedTimeEquals`.
- Default Claude model id (`claude-sonnet-4-6`) doesn't exist — corrected to
  `claude-sonnet-5`.
- `index.html`/`angular.json` referenced a `favicon.ico` and `assets/` folder that
  were never created — replaced with an inline SVG favicon.

None of this required a database or your API credentials to find or fix — it's
static analysis + a real compiler/build. You still need to do everything in
section 2.1 (paste your own connection string, JWT secret, Google/Razorpay/Claude
keys, SMTP credentials) before the app is actually usable end-to-end, and the
items in section 4's TODO list are still open.

---

## 1. Project structure

```
Datamint/
├── backend/
│   ├── Datamint.sln
│   └── src/
│       ├── Datamint.Domain/          # Entities, enums — no dependencies on anything else
│       ├── Datamint.Application/     # Interfaces, DTOs, orchestration logic (DocumentProcessingService)
│       ├── Datamint.Infrastructure/  # EF Core, Claude/MailKit/Razorpay/Google implementations
│       └── Datamint.API/             # Controllers, Program.cs, appsettings, middleware
└── frontend/
    └── src/app/
        ├── core/                     # services, guards, interceptors, models (singleton, app-wide)
        ├── shared/components/        # navbar, toast, animated upload-progress — reused everywhere
        └── features/                 # one folder per page/module — landing, auth, upload,
                                       # preview-edit, subscription, admin, legal
```

Each layer only depends on the one below it (`API → Infrastructure → Application → Domain`),
and each Angular feature is a self-contained lazy-loaded standalone component. This is what
gives you "change one thing, nothing else breaks": swap `ClaudePdfExtractionService` for a
different AI provider and nothing in `Domain`, `Application`, or the Angular app needs to change.

## 2. Backend setup

```bash
cd backend
dotnet restore
dotnet tool install --global dotnet-ef   # if you don't already have it
```

### 2.1 Fill in credentials
Open `backend/src/Datamint.API/appsettings.json` and replace every placeholder value
(each is commented with a `// N` marker explaining what it's for):

| Key | What to put there |
|---|---|
| `ConnectionStrings:DefaultConnection` | Your SQL Server connection string |
| `Jwt:Secret` | A long random string (32+ chars) — used to sign login tokens |
| `GoogleAuth:ClientId` | OAuth 2.0 **Web** Client ID from Google Cloud Console → also paste into `frontend/src/environments/environment.ts` |
| `Email:Host/Port/Username/Password/FromAddress` | Your MailKit/SMTP sender (Gmail needs an **App Password**, not your login password) |
| `AiProvider:Provider` | `"Claude"` or `"OpenAI"` — whichever one you have a key for right now |
| `Claude:ApiKey` / `OpenAI:ApiKey` | Your Anthropic or OpenAI API key (only the one matching `AiProvider:Provider` needs to be real) |
| `Razorpay:KeyId` / `Razorpay:KeySecret` | From your Razorpay dashboard (use test keys first) |

For production, don't leave real secrets in `appsettings.json` — use
`dotnet user-secrets` locally or environment variables / a key vault in deployment.

### 2.1a Switching AI providers
Both Claude and OpenAI extraction are fully implemented side by side
(`ClaudeFieldExtractionService` / `OpenAiFieldExtractionService`, both implementing
`IAiFieldExtractionService`) — flipping `AiProvider:Provider` between `"Claude"`
and `"OpenAI"` in `appsettings.json` (or a `AiProvider__Provider` env var) is the
only change needed; `Program.cs` picks the matching implementation at startup.
PDF reading/OCR (`PdfTextExtractionService`) is shared and unaffected either way.
It currently defaults to `"OpenAI"` since that's the key you have right now —
switch it to `"Claude"` any time by changing that one value once you have an
Anthropic key too.

### 2.2 Create the database
```bash
cd src/Datamint.API
dotnet ef migrations add InitialCreate -p ../Datamint.Infrastructure -s .
dotnet ef database update -p ../Datamint.Infrastructure -s .
```
`Program.cs` also auto-migrates and seeds a default admin + 3 placeholder plans on
startup, so the manual `database update` step is a safety net if you disable that.

**Default seeded admin:** `admin@datamint.local` / `ChangeMe123!` — sign in once,
then change the password immediately from a real deployment.

### 2.3 OCR setup (for scanned PDFs)
The scaffold uses Tesseract for OCR. You need:
1. A `tessdata` folder next to the API executable containing `eng.traineddata`
   (download from https://github.com/tesseract-ocr/tessdata).
2. A page-rendering step (PDF page → image) wired into
   `ClaudePdfExtractionService.RunOcrOnPage` — this scaffold leaves that call site
   marked with a `TODO`-style comment so you can plug in whichever PDF-rasterizer
   NuGet package you're comfortable with (e.g. `Docnet.Core`, `PdfiumViewer`, or
   shelling out to `pdftoppm`) without pulling in a native binary at scaffold time.

### 2.4 Run it
```bash
cd src/Datamint.API
dotnet run
```
Swagger UI is available at `/swagger` in Development.

## 3. Frontend setup

```bash
cd frontend
npm install
npm start
```
Runs on `http://localhost:4200` by default, pointed at `https://localhost:5001/api`
in `environment.ts` — update if your API runs elsewhere.

### 3.1 Google Sign-In
Fully wired — `shared/components/google-signin-button` renders the real
Google-hosted button (via the GSI script already included in `index.html`) and
emits the ID token, which `login.component.ts` / `register.component.ts` both
send to `authService.loginWithGoogle(idToken)`. Nothing to implement: just set
`environment.googleClientId` (frontend) and `GoogleAuth:ClientId` (backend) to
the **same** OAuth Web Client ID from Google Cloud Console, with
`http://localhost:4200` (and your real domain once deployed) added as an
Authorized JavaScript origin — no redirect URI is needed for this flow.

### 3.2 Razorpay
`checkout.component.ts` already calls the Razorpay Checkout widget (script included
in `index.html`) once the backend creates an order. Just make sure
`environment.razorpayKeyId` matches your dashboard's public key.

## 4. What's fully implemented vs. a stub

**Fully wired (business logic + endpoint + UI all connected):**
- Register / login / JWT issuing, refresh-token model
- PDF upload → text extraction (PdfPig) → Claude AI structured extraction → DB storage
- Preview/edit UI bound to real update endpoint
- Excel export (ClosedXML) and email-with-attachment (MailKit)
- Free-tier 2-upload gate, enforced server-side by IP address (not a trusted client
  header) → forced redirect to `/plans`; logged-in users without an active
  subscription, or over their plan's monthly limit, get the same redirect
- Document access is ownership-checked: a document tied to a logged-in user can
  only be viewed/edited/exported/emailed by that user; anonymous (pre-login)
  documents are reachable by anyone with the id, matching the free-tier flow
- Plans (data-driven, editable from Admin), Razorpay order-create + signature verification
- Admin dashboard stats, audit log viewer/filter, user management, plan management
- Global exception handling, Serilog file logging, soft-delete + audit trail on every action

**Left as a clearly marked TODO (needs a decision only you can make, or a native
dependency this sandbox couldn't install/test):**
- OCR page-rasterization call (`RunOcrOnPage` — pick a PDF-to-image library)
- Moving PDF processing off the request thread onto a background queue (Hangfire /
  `IHostedService`) so uploads return instantly and the frontend's animated
  progress steps reflect real backend state instead of a simulated timer
- Real pricing numbers (seeded as $0 placeholders — set from Admin → Plans)
- Refresh-token rotation endpoint (`POST /api/auth/refresh`) — the DTOs and DB
  table exist; add the controller action when you're ready to wire it in
- `Razorpay` 3.1.0 is a .NET Framework-targeted package restored via compat shim
  (`NU1701` warning) — it works, but there's no true .NET 8 build; consider
  calling Razorpay's REST API directly with `HttpClient` if you want to drop it

## 5. Security notes
- Passwords are BCrypt-hashed, never stored in plain text.
- All mutating endpoints require `[Authorize]`; admin endpoints require the `Admin` role.
- CORS is locked to the origins listed in `Cors:AllowedOrigins`.
- Razorpay payments are verified server-side via HMAC signature before a subscription is activated — the frontend result is never trusted on its own.
- Every login, upload, extraction, export, email-send, and admin action writes an `AuditLog` row.
