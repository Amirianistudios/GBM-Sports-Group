# Current state

Last verified: 2026-08-19. Every number below was read from the live project or
the repository, not carried over from a previous document.

Read this file and `CLAUDE.md` first. They should be enough to continue without
re-deriving the project.

## Where things live

| Concern | Location |
|---|---|
| Application source | GitHub `Amirianistudios/GBM-Sports-Group`, branch `main` (private) |
| Live data + auth | Supabase `GBM Intelligence`, ref `tyzndcjuiffnyhluddce`, eu-west-2, Postgres 17 |
| Deployment | Vercel project `gbm-sports-group`, built automatically from `main` |
| Local checkout | `/Users/antoniamirian/gbm-intelligence` |

## Build status

Verified from the repository root:

| Command | Result |
|---|---|
| `pnpm install` | passes — 5 workspace projects |
| `pnpm typecheck` | passes — all 4 packages |
| `pnpm lint` | passes — 0 errors, 6 warnings |
| `pnpm test` | passes — 14 tests, 2 files |
| `pnpm build` | passes — 12 routes compiled |

### What had broken the deployment

Root `package.json` filtered `@gbm/web`, while `apps/web/package.json` was named
`web`. `pnpm build` from the root therefore matched no project and exited
non-zero — which is what Vercel runs. Fixed by adopting `@gbm/*` naming across
the workspace.

Also repaired in the same pass:

- `packages/database`, `packages/providers` had no `package.json` and were not
  resolvable workspace packages. `packages/shared` and `services/analytics` were
  empty and have been removed.
- A nested `apps/web/pnpm-lock.yaml` competed with the root lockfile. Removed.
- Root scripts referenced six TypeScript files that did not exist. They now
  point at real implementations in `services/ingestion`.
- `pnpm test` had no test files and no config, so the command failed by
  definition. There is now a vitest config and a real suite.
- Two ESLint errors (`react-hooks/purity` on `Date.now()` inside a Server
  Component; a `prefer-const` violation) that would fail a lint-gated build.
- `apps/web` had a `workspace:*` dependency it never imported. Removed, so the
  app installs standalone regardless of Vercel's Root Directory setting.

## Database

48 tables. Row counts as at 2026-08-19:

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| players | 30 | | source_facts | 90 |
| player_external_ids | 30 | | source_records | 0 |
| clubs | 50 | | transfers | **0** |
| competitions | 10 | | matches | 0 |
| countries | 35 | | player_season_stats | 0 |
| market_values | 235 | | entity_resolution_candidates | 0 |
| contracts | 30 | | discovery_signals | 31 |
| representation_records | 30 | | player_events | 0 |
| watchlists | 0 | | alerts | 0 |
| scouting_reports | 0 | | ingestion_runs | **0** |
| auth users | 1 | | ingestion_errors | 0 |

What those numbers mean:

- The 30 players are a hand-generated sample applied as SQL during the initial
  build. All 30 carry exactly one external id: `TRANSFERMARKT_DATASET`. **No
  cross-provider resolution has happened yet.**
- `transfers` is 0 because the generated `data/sql/04_transfers_01.sql` was
  never applied.
- `ingestion_runs` is 0 because no pipeline had existed. The service now exists
  but has not been run against the database.
- The 31 `discovery_signals` were inserted by hand and are sample data, not
  computed intelligence. Migration `20260819130100` retires them and replaces
  them with a reproducible computation.

### Migrations

Applied to the hosted project:

- `20260819120000_core_entities.sql`
- `20260819120100_football_data.sql`
- `20260819120200_provenance_ingestion_resolution.sql`
- `20260819120300_gbm_workspace.sql`
- `20260819120400_rls_and_seed.sql`

Committed but **not yet applied**:

- `20260819125000_analytical_views.sql` — captures five views (`v_player_current_value`,
  `v_player_representation`, `v_player_source_coverage`, `v_player_value_trend`,
  `v_representation_opportunities`) that exist in the live database but had
  never been written into a migration. The dashboard and player profile read
  from them, so a database rebuilt from migrations alone would have returned
  500s. This is a drift fix, not a schema change — applying it is a no-op
  against the current database.
- `20260819130000_ingestion_idempotency.sql` — natural keys for `transfers` and
  `contracts` (`NULLS NOT DISTINCT`), plus `gbm_recompute_data_confidence()`.
- `20260819130100_discovery_signals.sql` — retires the sample signals and adds
  `gbm_compute_discovery_signals()`.

## Application

Twelve routes, all building: `/`, `/login`, `/players`, `/players/[id]`,
`/clubs`, `/discover`, `/scouting`, `/watchlists`, `/representation`, `/data`,
`/auth/signout`, `/_not-found`. Auth is enforced for the whole app by
`src/proxy.ts`; there is no public surface.

Not yet verified: rendering against the deployed environment, and the mobile
viewport pass (390×844, 430×932, 768×1024, 1440×900).

## Ingestion service — built, not yet run

`services/ingestion` is new in this session and has not touched the database.

| Command | Does |
|---|---|
| `pnpm data:download` | Fetches per-table `.csv.gz` from the dataset's R2 bucket; writes `data/manifests/transfermarkt.json` |
| `pnpm data:import` | Normalises into the canonical model, reconciling through `*_external_ids` so re-runs update rather than duplicate |
| `pnpm reep:resolve` | Joins the Reep v0 register on Transfermarkt id to attach Sofascore, FotMob, Wyscout, FBref, Understat, BeSoccer, SportMonks, API-Football, Impect and Wikidata ids |
| `pnpm signals:compute` | Recomputes discovery signals set-based in SQL |
| `pnpm quality:check` | Ten data-quality checks |
| `pnpm ingest:status` | Recent runs and row counts |

Every writing command opens an `ingestion_runs` row and closes it even on
failure, so the database records what happened.

### Dataset

`dcaribou/transfermarkt-datasets`, version **2026-08-05**, present locally at
`data/transfermarkt/` (12 gzipped tables, 228 MB, byte-identical to the
published archive). Raw data is git-ignored; manifests and generated seed SQL
are tracked.

Available to import: 50,149 players (22,292 active in 2025), 796 clubs, 65
competitions, 124 countries, 175,165 transfers, 656,301 valuations. 26,853
players carry an `agent_name`; 23,296 do not — the basis of the representation
research queue.

## Known gaps

1. Cross-provider identity is unproven — every player has one provider id.
2. No ingestion has run; the pipeline is untested against the database.
3. Three migrations are committed but not applied.
4. `.env.example` could not be written: the local permission configuration
   blocks all `.env*` paths. `docs/DEPLOYMENT.md` holds the authoritative
   variable-name list meanwhile.
5. `gh` and `vercel` CLIs are not installed on the development machine, so
   deployment state cannot be read from here.
6. No provider adapters beyond Wyscout (untested, deliberately out of scope)
   and Reep.
7. Only unit tests exist — no integration test touches Supabase.

## Next

1. Confirm the Vercel deployment triggered by the current `main` commit.
2. Apply the three pending migrations.
3. Run `pnpm data:import` (staged), then `pnpm reep:resolve` — this is what
   turns 30 sample players into a real multi-source dataset.
4. Prove one player end-to-end across providers on the profile page.
5. Schedule the refresh via GitHub Actions.
