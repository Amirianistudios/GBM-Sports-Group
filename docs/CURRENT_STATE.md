# Current state

Last verified: 2026-08-20. Every number below was read from the live project or
the repository, not carried over from a previous document.

Read this file and `CLAUDE.md` first. They should be enough to continue without
re-deriving the project. The audit that re-verified everything is
[`GBM_CURRENT_STATE_AUDIT.md`](GBM_CURRENT_STATE_AUDIT.md); the data-execution
plan now in flight is
[`GBM_DATA_IMPLEMENTATION_PLAN.md`](GBM_DATA_IMPLEMENTATION_PLAN.md).

**Headline change on 2026-08-20:** the pipeline has now run end-to-end — against
a local Supabase stack (Docker, Postgres 17, all migrations, production's grant
model) rather than production, which is one repository secret away. The staged
run imported 2,120 players with 64,048 valuations, 22,192 transfers and 27,597
season-stat rows, resolved 99.7% of them across up to 9 providers through the
Reep v1 register, recomputed 1,111 discovery signals, and passed the end-to-end
verify (`pnpm ingest:verify`) on a real player. Three defects were found by
execution and fixed: a competition_tier enum value the schema never defined, a
season-stats upsert collision on NULL dimensions, and Reep v1's per-provider
bridge namespaces (`transfermarkt|spieler`, not `player`). Production still
holds the 30 sample players until the staged import workflow can run — see
*Next* below.

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
| `pnpm test` | passes — 19 tests, 3 files |
| `pnpm build` | passes — 12 routes compiled |

The five gates are now mechanical: `.github/workflows/ci.yml` runs them on
every push and pull request (all runs green so far). `data-refresh.yml` is the
weekly scheduled pipeline; `staged-import-once.yml` is a push-triggered
bootstrap for the first controlled production import. Both need the two
repository secrets named below.

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
| `20260820120000_season_stats_idempotency` | NULLS NOT DISTINCT natural key for player_season_stats (applied to hosted 2026-08-20) |

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

## Ingestion service — proven end-to-end (locally)

`services/ingestion` has now executed the full pipeline against a scratch
Supabase stack (Docker: `supabase start`, all 12 migrations, the production
sample seeds, production's legacy grant model via
`auto_expose_new_tables = true` in `supabase/config.toml`).

| Command | Does |
|---|---|
| `pnpm ingest:preflight` | Credentials, schema shape, provider seed, upstream reachability — fails fast with named causes |
| `pnpm data:download` | Fetches per-table `.csv.gz` from the dataset's R2 bucket (now incl. games + appearances); writes `data/manifests/transfermarkt.json` |
| `pnpm data:import` | Normalises into the canonical model, reconciling through `*_external_ids` so re-runs update rather than duplicate; aggregates appearances into counting season statistics (`--skip-stats` to omit) |
| `pnpm reep:resolve` | Joins the **Reep v1** register (weekly releases, checksum-verified, pinned in `data/manifests/reep.json`) to attach Transfermarkt, Wyscout, SportMonks, API-Football, StatsBomb, Understat and FBref ids at confidence 0.99 |
| `pnpm signals:compute` | Recomputes discovery signals set-based in SQL |
| `pnpm quality:check` | Twelve data-quality checks |
| `pnpm ingest:verify` | The success criterion as a command: ≥1 player with identity, ≥2 providers, club, position, market history and statistics — exits non-zero otherwise |
| `pnpm ingest:status` | Recent runs and row counts |

Every writing command opens an `ingestion_runs` row and closes it even on
failure, so the database records what happened.

Rehearsal results (2026-08-20, staged `--max-players 2000`, dataset
2026-08-05, Reep release `20260820T103440Z`):

| Measure | Result |
|---|---:|
| players (120 pre-seeded + 2,000 imported) | 2,120 |
| market_values / transfers / player_season_stats | 64,048 / 22,192 / 27,597 |
| seasons created | 538 |
| players matched in Reep v1 | 2,114 (99.7%) |
| identities written (9 providers max/player) | 13,240 |
| current discovery signals | 1,111 |
| `ingest:verify` | **PASS** — Lukáš Hrádecký: 9 providers, 38 valuations, 39 stat rows, 8 transfers |

Idempotency held under re-runs: second import produced +0 new entities, 2,000
updates, identical valuation/transfer counts, and representation rows were
reconfirmed rather than re-inserted. The run ledger recorded the two mid-run
failures as FAILED with 1 error each — observability behaving as designed.

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

1. **Production has not received the staged import yet.** The pipeline is
   proven on the local stack, the workflows exist, but the two repository
   secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are not
   configured, so the staged-import workflow fails at preflight — loudly,
   naming them. Production therefore still holds the 30 sample players.
2. The integration rehearsal is a documented manual procedure
   (`supabase start` → seeds → pipeline), not yet a CI job. Wiring the local
   stack into CI is the next hardening step.
3. Sofascore, FotMob and Wikidata ids are no longer supplied by Reep's curated
   v1 bridges (they moved to its 0.85-confidence overlay, which GBM does not
   auto-ingest). New players get neither unless the overlay is admitted
   through `entity_resolution_candidates` review — a deliberate open decision.
4. API-Football adapter exists and is verified, but the Pro tier ($19/mo)
   needed for current-season statistics is not funded; season statistics
   currently come from the dataset's appearances (counting metrics only, no
   xG). Wyscout remains unconfigured pending a quote.
5. The dataset's last publish was 2026-08-05 — a 15-day gap against its weekly
   cadence, consistent with the upstream scraper-block commits. The weekly
   workflow reports staleness rather than failing on it.

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

## Provider research

Nine external sources were assessed on 2026-08-19 — see
[`DATA_SOURCES.md`](DATA_SOURCES.md) for the decision matrix,
[`DATA_SOURCE_RESEARCH.md`](DATA_SOURCE_RESEARCH.md) for the evidence, and
[`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md) for the under-18 position.

Two findings change the roadmap:

- **The free tier cannot supply advanced metrics.** Sofascore, FotMob and FBref
  are all downstream Opta/Stats Perform licensees that cannot sublicense; FBref's
  data was deleted outright in January 2026. This is one market structure, not
  three results. Advanced metrics must be licensed — Wyscout is the candidate,
  and its adapter already exists.
- **`resolve.ts` is pinned to a frozen register.** Reep v0 has taken no updates
  since 21 June 2026. Reep v1 is live, free and CC0 with 1,703,816 entities
  against v0's 444,707. Migrating is the highest-value free action available.

## Next

1. **Add the two repository secrets** (`NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`) under GitHub → Settings → Secrets and
   variables → Actions. This is the only step requiring the project owner.
2. Change `.github/import-trigger` on the working branch (any edit) — the
   staged-import workflow then runs the rehearsed pipeline against production
   and finishes with `ingest:verify`.
3. Verify production with `pnpm ingest:status` / SQL, then open the profile
   page of a multi-provider player.
4. Merge the working branch to `main` so the weekly `data-refresh.yml`
   schedule becomes active (scheduled workflows only run from the default
   branch), then delete `staged-import-once.yml` and its trigger file.
5. Scale in steps (10,000 → full) by dispatching `data-refresh.yml` with
   `max_players`, or let the weekly run carry increments.
6. Decide API-Football Pro ($19/mo) for current-season statistics and injury
   histories; request the Wyscout quote for advanced metrics.
