# GBM Intelligence

Private football scouting and talent intelligence platform for GBM Sports Group.

Not a player database and not a Wyscout frontend. The value comes from combining
many sources, keeping every fact traceable to the source that asserted it, and
surfacing disagreement between sources rather than hiding it.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 · React 19 · TypeScript · Tailwind 4 · mobile-first PWA |
| Data | Supabase (Postgres 17) — `GBM Intelligence`, ref `tyzndcjuiffnyhluddce` |
| Ingestion | TypeScript service, streamed CSV → Postgres, run from CLI or CI |
| Deploy | GitHub `main` → Vercel, automatic |

## Layout

```
apps/web              Next.js application — self-contained, no workspace deps
packages/providers    Provider adapters behind one FootballDataProvider contract
packages/database     Generated Supabase types (committed; CI has no DB access)
services/ingestion    Dataset acquisition, import, entity resolution, quality
supabase/migrations   The reproducible schema
scripts               Developer tooling
docs                  Architecture, current state, deployment
```

## Getting started

```bash
pnpm install
# add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local
pnpm dev
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the web application locally |
| `pnpm build` | Production build (must pass before pushing) |
| `pnpm typecheck` | Typecheck every workspace package |
| `pnpm lint` | Lint the web application |
| `pnpm test` | Unit tests |
| `pnpm db:types` | Regenerate Supabase types after a migration |
| `pnpm data:download` | Fetch the published Transfermarkt dataset |
| `pnpm data:import` | Import it into Supabase (idempotent) |
| `pnpm data:update` | Download if newer, then import, resolve and recompute signals |
| `pnpm reep:resolve` | Attach cross-provider identities via the Reep register |
| `pnpm signals:compute` | Recompute discovery signals |
| `pnpm quality:check` | Report data quality |
| `pnpm ingest:status` | Recent ingestion runs and row counts |

## Principles

**GBM owns its identities.** `players.id` is a GBM UUID. Provider ids live in
`player_external_ids` with a confidence and a match method. Reep bootstraps the
identity graph; it does not own it.

**Provenance is not optional.** `source_records` keeps raw payloads,
`source_facts` records which provider asserted which value. When two sources
disagree GBM keeps both and shows the conflict.

**"No agency listed" is not "unrepresented".** It records what a source
displayed on a date. Every screen that shows it says so.

**Scout opinion stays separate from provider statistics.** Scouting reports and
ratings never mix into the normalised data.

## Documentation

- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — what actually exists right now
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — architecture, environment, deploy flow
