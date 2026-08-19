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
- The 31 `discovery_signals` are now genuinely computed. The hand-seeded
  originals were retired (not deleted) with their provenance stamped into
  `evidence`, and replaced by `gbm_compute_discovery_signals()`: 1
  CONTRACT_EXPIRING, 16 RAPID_VALUE_GROWTH, 14 UNREPRESENTED_HIGH_POTENTIAL.
  Running it twice returns identical counts and zero duplicate player/type
  pairs, so it is genuinely idempotent.

### Migrations

All eleven migrations are applied to the hosted project, and the repository now
reproduces the hosted schema exactly. Three had been applied directly to the
database in an earlier session and existed in **no file** — `security_hardening`,
`natural_key_constraints` and the intelligence views. They have been captured,
so a database rebuilt from `supabase/migrations/` is no longer missing
constraints and hardening the live one has.

| Migration | Purpose |
|---|---|
| `20260819120000_core_entities` | Canonical model, provider registry |
| `20260819120100_football_data` | Transfers, contracts, values, representation |
| `20260819120200_provenance_ingestion_resolution` | Provenance, ingestion, entity resolution |
| `20260819120300_gbm_workspace` | Watchlists, scouting, signals |
| `20260819120400_rls_and_seed` | RLS policies and provider seed |
| `20260819120500_security_hardening` | *(captured)* search_path pinning, function grants |
| `20260819120600_natural_key_constraints` | *(captured)* unique names for clubs/competitions/countries |
| `20260819125000_analytical_views` | *(captured)* the five `v_*` views, now `security_invoker` |
| `20260819130000_ingestion_idempotency` | Natural keys for re-import, data-confidence function |
| `20260819130100_discovery_signals` | Reproducible signal computation |
| `20260819130200_harden_views_and_functions` | Closes the anonymous read path (below) |

## Security

Two live vulnerabilities were found by querying the database as `anon` rather
than by reading code. Both are fixed and the fix is verified.

**Anonymous read of the entire scouting database.** The five `v_*` views were
created without `security_invoker`, so they ran with the owner's privileges and
bypassed row-level security. Combined with the default `SELECT` grant to `anon`
— and the anon key being public, since it ships in the browser bundle — an
unauthenticated request to `/rest/v1/v_representation_opportunities` returned
every player with name, date of birth, valuation, contract expiry and agency
status. Verified as `anon`: 30 rows before, `permission denied` after. Verified
as the real signed-in owner: still 30 rows, so legitimate access is unaffected.

**Anonymous invocation of the ingestion functions.** Both functions added with
the pipeline are `SECURITY DEFINER` and mutate data, and the default
EXECUTE-to-PUBLIC grant left them callable through `/rpc/`.
`gbm_compute_discovery_signals()` deletes and rewrites the whole signal set, so
this was a data-destruction vector open to the internet. Execute is now revoked
from `public`, `anon` and `authenticated`, and granted only to `service_role`.

Neither hole originated in the application code, which is why neither showed up
in a build or a typecheck.

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

1. Cross-provider identity is still unproven — every player has exactly one
   provider id. `pnpm reep:resolve` exists to fix this but has not been run.
2. No ingestion has run against the database; `ingestion_runs` is still 0.
   The pipeline's SQL side is now proven, its write path is not.
3. `.env.example` could not be written: the local permission configuration
   blocks all `.env*` paths, for reading and writing alike.
   `docs/DEPLOYMENT.md` holds the authoritative variable-name list meanwhile.
4. `gh` and `vercel` CLIs are not installed on the development machine, so
   deployment state cannot be read from here.
5. No provider adapters beyond Wyscout (unconfigured, deliberately out of
   scope) and Reep.
6. Only unit tests exist. Nothing integration-tests the importer against a
   real database, which is how the SQL defects below reached the repository in
   the first place.

### Defects found and fixed after first commit

Recorded because the pattern matters more than the individual bugs: every one
was invisible to `pnpm build`, `pnpm typecheck` and `pnpm lint`, and every one
was found by executing the thing rather than reading it.

- `extract(day from <date> - <date>)` raised `function pg_catalog.extract(unknown,
  integer) does not exist` — in Postgres `date - date` is an integer, not an
  interval. Migration `20260819130100` would have failed outright on apply.
- Discovery signals emitted one row per contract and per representation record,
  so a player with two contracts appeared twice in a single Discover list.
  Now deduplicated per player per signal type.
- `RAPID_VALUE_GROWTH` scored linearly and capped at 100, so 100% growth and
  1400% growth ranked identically — flattening exactly the ordering the page
  sorts on. Now logarithmic: 50% maps to 50, ~1600% to 100.
- The importer paired inserted entities with their external ids by array
  position in an `INSERT … RETURNING` response. Had PostgREST ever returned
  rows out of order, a player would have silently acquired another player's
  Transfermarkt id. GBM UUIDs are now minted client-side, removing the
  ordering assumption entirely.
- The importer did not reconcile against `clubs_name_uniq` or
  `competitions_name_area_uniq`, so a club already present without a
  Transfermarkt external id would have aborted the run on a unique violation
  partway through. It now adopts such entities by natural key.

## Next

1. Confirm the Vercel deployment triggered by the current `main` commit.
2. Run `pnpm data:import --max-players 2000` as a staged first real ingestion,
   then `pnpm reep:resolve`. This is the step that turns 30 sample players into
   a real multi-source dataset and finally populates `ingestion_runs`.
3. Prove one player end-to-end across providers on the profile page.
4. Add an integration test that runs the importer against a scratch database.
5. Schedule the weekly refresh via GitHub Actions.
