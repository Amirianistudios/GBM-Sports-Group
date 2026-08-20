# Deployment

## Architecture

```
LOCAL DEVELOPMENT
        │  git push
        ▼
GITHUB  Amirianistudios/GBM-Sports-Group @ main     ← source of truth for the application
        │  automatic Git integration
        ▼
VERCEL  gbm-sports-group                            ← builds and serves; stores nothing
        │  queries at runtime
        ▼
SUPABASE  GBM Intelligence (tyzndcjuiffnyhluddce)   ← source of truth for live data
```

Three responsibilities, kept separate:

- **GitHub** holds the application: pages, components, API routes, provider adapters, the ingestion service, Supabase migrations, scripts, tests, docs. No live data, no secrets.
- **Supabase** holds the live data and authentication. Never exported into Git.
- **Vercel** only deploys what is on `main`. It is not a development environment and holds no source of record.

## Normal workflow

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build          # must pass before pushing

git add -A && git commit -m "…"
git push origin main
```

Pushing to `main` is the deploy. Vercel's Git integration picks up the commit and builds it. **Do not run `vercel deploy`** — a manual deployment bypasses the pipeline and makes the deployed artefact untraceable to a commit.

If a deployment fails, fix the source, prove `pnpm build` passes locally, commit, push, and let the integration retry.

### Vercel is deployment-only

Vercel's role is exactly: `main` updates → automatic production deployment.
It stores no data, runs no backend logic, holds no source of record, and is
never operated manually.

Verified project facts (2026-08-20, from Vercel's own integration output and
live probes — see [`VERCEL_ARCHITECTURE_AUDIT.md`](VERCEL_ARCHITECTURE_AUDIT.md)):

| Fact | Value |
|---|---|
| Project | `gbm-sports-group` (`prj_to6e5a4jT2170ZN244pTvh7NDEOx`) |
| Team | `amirianantoni10-9420s-projects` |
| Root Directory | repository root (monorepo) |
| Production deployment | `https://gbm-sports-group-git-main-amirianantoni10-9420s-projects.vercel.app`, behind Vercel Authentication (platform SSO in front of the app's own Supabase auth) |
| Not this project | `gbm-sports-group.vercel.app` (returns `DEPLOYMENT_NOT_FOUND`) |

**Preview deployments are disabled declaratively and the behaviour is
verified**: `vercel.json` (repository root, mirrored in `apps/web/`) carries
an `ignoreCommand` that skips every non-production build — Vercel's own PR
comment for a branch push reports the deployment as *Ignored/Skipped*.
`"github": { "silent": true }` additionally stops Vercel commenting on PRs
and commits. Development branches therefore produce **no** builds, **no**
preview URLs and **no** comment noise; pushes to `main` build and deploy
exactly as before.

## Build configuration

The repository is a pnpm workspace. `apps/web` deliberately has **no `workspace:*` dependencies**, so it installs and builds correctly whether Vercel's Root Directory is the repository root or `apps/web`.

| Setting | Value |
|---|---|
| Framework | Next.js (16.3.1, Turbopack) |
| Package manager | pnpm 11.22.0 |
| Node | ≥ 20 |
| Build (repo root) | `pnpm build` → `pnpm --filter @gbm/web build` |
| Build (root = apps/web) | `next build` |

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Preview and Production). Values are never stored in the repository.

### Required by the web application

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Public by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. Public by design — every query is constrained by row-level security. |

Both are read lazily by `apps/web/src/lib/supabase/env.ts`. If either is missing the application raises a message naming the variable, rather than failing opaquely.

### Server-side only — ingestion, never set on the web project

| Name | Notes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Must never be exposed through a `NEXT_PUBLIC_` variable. |
| `SUPABASE_SECRET_KEY` | Accepted alternative for projects issuing `sb_secret_…` keys. |

### Developer tooling only — not needed to build or deploy

| Name | Notes |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token used by `pnpm db:types`. |
| `SUPABASE_PROJECT_REF` | Defaults to `tyzndcjuiffnyhluddce`. |
| `API_FOOTBALL_KEY` | api-sports.io key for season/match statistics and injuries. Server-side only — never expose via `NEXT_PUBLIC_`. |
| `API_FOOTBALL_BASE_URL` | Defaults to `https://v3.football.api-sports.io`. |
| `API_FOOTBALL_RATE_LIMIT_PER_SECOND` | Defaults to 2. The per-minute cap is undocumented, so this stays conservative. |
| `REEP_API_KEY`, `REEP_BASE_URL` | Only for the metered Reep v1 API. The downloadable v0 register needs no key. |
| `GBM_USER_AGENT` | Identifies GBM to public sources that ask for a contact header. |
| `WYSCOUT_*` | Not configured. No code path requires it; the application builds and runs without it. |

> `.env.example` at the repository root is the fill-in template for these
> names. The ingestion pipeline in GitHub Actions reads
> `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from repository
> secrets (Settings → Secrets and variables → Actions), never from a file.

## Database migrations

Migrations in `supabase/migrations/` are the reproducible definition of the
schema. Apply them with the Supabase CLI or dashboard; they are not applied by
the build. All twelve are applied to the hosted project as of 2026-08-20 —
`docs/CURRENT_STATE.md` tracks exactly which are live.

For local development, `supabase start` (Docker) boots a faithful scratch
stack and applies every migration; `supabase db reset` re-creates it. This is
how the ingestion pipeline is rehearsed before it touches production.
