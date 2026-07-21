# Branching, versioning, and backup

## Branches

Three long-lived branches, each mapped to an environment:

| Branch | Environment | Purpose |
|---|---|---|
| `develop` | Development | Day-to-day work happens here (directly, or via short-lived branches merged in) |
| `qa` | QA | Merge `develop` here when a batch of work is ready to be tested end-to-end |
| `master` | Production | Merge `qa` here to release - this is what's live |

`master` and `qa` are protected on GitHub (no force-push, no branch deletion). `develop`
is intentionally left unprotected since it's the active branch where local history
cleanup is sometimes legitimate for a solo developer.

Promotion flow, one direction only (`develop` → `qa` → `master`):
```
git checkout qa && git merge develop && git push
git checkout master && git merge qa && git push
```

## Versioning

One SemVer version number (`MAJOR.MINOR.PATCH`, e.g. `1.0.0`), tracked in three places that
must be bumped together on release:

- `backend/Directory.Build.props` - `<Version>` - shared automatically by all 4 backend
  projects (Domain/Application/Infrastructure/API), so this is the only backend edit needed.
- `frontend/package.json` - `version`.
- All three Angular environment files (`frontend/src/environments/environment.ts`,
  `environment.qa.ts`, `environment.prod.ts`) - `version` key, shown in the site footer.

The backend also exposes `GET /api/version` (`{ version, environment }`) for checking what's
actually running without needing shell/RDP access - its `version` string additionally gets an
automatic `+<git-commit-sha>` suffix from MSBuild's deterministic build info (e.g.
`1.0.0+04d5b70...`), which is valid SemVer build metadata and useful for tracing exactly which
commit built a given running instance.

### Cutting a release

1. Bump the version in all 3 places above (on `develop`, as part of the work being released).
2. Promote `develop` → `qa` → `master` as above.
3. On `master`: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`

## Environment config

ASP.NET Core merges `appsettings.{ASPNETCORE_ENVIRONMENT}.json` over the base
`appsettings.json` automatically. Three real, gitignored config files exist per machine
(never committed - see `.gitignore`), each with a tracked `.example` template showing its
shape:

- `appsettings.json` - Development (base, `appsettings.json.example`)
- `appsettings.QA.json` - QA overrides only (`appsettings.QA.json.example`)
- `appsettings.Production.json` - Production overrides only (`appsettings.Production.json.example`)

Local launch profiles exist for all three (`Properties/launchSettings.json`): `dotnet run
--launch-profile QA` exercises the QA config locally without needing a real QA server.

The Angular equivalent is `ng build --configuration=qa` / `--configuration=production`,
which swap in `environment.qa.ts` / `environment.prod.ts` via `angular.json`'s
`fileReplacements` (this was previously missing entirely for `production` - a real,
just-fixed bug where prod builds silently shipped the dev environment file).

No real Dev/QA/Prod servers exist yet - this is the branch/config/version structure ready
for whenever real deployment happens.

## Backup mirror

Every push to `origin` also pushes to a second, private GitHub repo
(`claude2026dev-dotcom/datamint-backup`), via a second push URL configured on the `origin`
remote itself (not a separate remote name, not a script/CI job):
```
git remote set-url --add --push origin https://github.com/claude2026dev-dotcom/datamint.git
git remote set-url --add --push origin https://github.com/claude2026dev-dotcom/datamint-backup.git
```
An ordinary `git push` from here on pushes to both automatically. `git fetch`/`git pull`
still only read from the primary repo.

**This is local `.git/config`, not something git syncs** - per this project's two-machine
workflow (see the root `CLAUDE.md`), the same two `set-url --add --push` commands need to be
run once on the other machine too, or pushes from there will only reach the primary repo.
