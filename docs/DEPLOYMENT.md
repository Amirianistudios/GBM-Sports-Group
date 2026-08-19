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

> `.env.example` could not be written from this environment — the local permission
> configuration blocks all `.env*` paths. The table above is the authoritative
> list of variable names until that file is updated by hand.

## Database migrations

Migrations in `supabase/migrations/` are the reproducible definition of the schema. Apply them with the Supabase CLI or dashboard; they are not applied by the build.

Pending application to the hosted project at the time of writing:

- `20260819125000_analytical_views.sql`
- `20260819130000_ingestion_idempotency.sql`
- `20260819130100_discovery_signals.sql`

See `docs/CURRENT_STATE.md` for exactly which are live.
