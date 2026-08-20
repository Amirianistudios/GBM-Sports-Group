# Current state

Last verified: 2026-08-20. Every number below was read from the live project or
the repository, not carried over from a previous document.

Read this file and `CLAUDE.md` first. They should be enough to continue without
re-deriving the project. The audit that re-verified everything is
[`GBM_CURRENT_STATE_AUDIT.md`](GBM_CURRENT_STATE_AUDIT.md); the data-execution
plan now in flight is
[`GBM_DATA_IMPLEMENTATION_PLAN.md`](GBM_DATA_IMPLEMENTATION_PLAN.md).

**Headline change on 2026-08-20: the staged production import has run and
verified.** After a full dress rehearsal on a local Supabase stack (which
surfaced and fixed three defects: a competition_tier enum value the schema
never defined, a season-stats upsert collision on NULL dimensions, and Reep
v1's per-provider bridge namespaces), GitHub Actions run
`staged-import-once #4` executed the rehearsed pipeline against production:
**2,000 players imported (2,030 total with the 30 originals updated in
place), 62,762 valuations, 21,685 transfers, 26,593 season-stat rows, 99.8%
resolved through Reep v1 across up to 9 providers, 1,026 current discovery
signals, 3/3 ingestion runs SUCCESS with 0 errors, `ingest:verify` PASS.**
All 30 pre-import players, 235 pre-import valuations and 30 representation
records verified still present; policies, RLS and views verified unchanged.

## Where things live

| Concern | Location |
|---|---|
| Application source | GitHub `Amirianistudios/GBM-Sports-Group`, branch `main` (private) |
| Live data + auth | Supabase `GBM Intelligence`, ref `tyzndcjuiffnyhluddce`, eu-west-2, Postgres 17 |
| Deployment | Vercel project `gbm-sports-group` (team `amirianantoni10-9420s-projects`), production built from `main` only, served behind Vercel Authentication at `gbm-sports-group-git-main-…vercel.app`; branch previews verified skipped via `vercel.json` (see [`VERCEL_ARCHITECTURE_AUDIT.md`](VERCEL_ARCHITECTURE_AUDIT.md)) |
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
weekly scheduled pipeline; its unattended schedule runs `data:update
--max-players 2000`, holding the staged scope until scaling is deliberately
authorized (dispatch the workflow with a higher or empty cap to scale).
`staged-import-once.yml`, the push-triggered bootstrap for the first
controlled production import, served its purpose (run #4) and was deleted
along with its trigger file. The Supabase project URL is baked in (public by
design); the one repository secret is `SUPABASE_SERVICE_ROLE_KEY`.

### The 2026-08-20 production-deployment incident, in full

Three separate faults stacked, which is why "fixed" was declared twice before
it was true:

1. **The build was broken on `main`** (workspace naming — see the next
   section). Fixed on the branch, merged as `03658be`.
2. **The Vercel Root Directory was unset** on a monorepo whose app lives in
   `apps/web`, so even the fixed code could not produce a servable production
   build; the dashboard showed "No Production Deployment". Fixed in the
   dashboard (Root Directory → `apps/web`).
3. **A stale commit was manually promoted.** With no ready production build
   to point at, the newest *Ready* row in the deployments list was the
   preview of `e442666` — the last branch push before `vercel.json`'s
   ignore rule (12:20 vs 12:36) and eight commits before the scouting UI
   existed. Redeployed/promoted from the dashboard, it became "Current
   Production": status Ready, content stale, and every route returning a
   bare `Internal Server Error` from the middleware. The middleware now
   fails legibly (`src/proxy.ts` names the missing configuration instead of
   a blank 500), and production must always come from the latest `main`
   through the Git integration — never from promoting old previews.

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

48 tables. Row counts as at 2026-08-20, after the staged production import
(GitHub Actions `staged-import-once` run 4, dataset release 2026-08-05, Reep
release `20260820T103440Z`):

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| players | **2,030** | | player_season_stats | **26,593** |
| player_external_ids | **14,651** | | seasons | 538 |
| clubs | 796 | | transfers | **21,685** |
| competitions | 65 | | matches | 0 |
| countries | 130 | | source_facts | 90 |
| market_values | **62,762** | | source_records | 0 |
| contracts | 1,470 | | entity_resolution_candidates | 0 |
| representation_records | 2,030 | | discovery_signals (current) | **1,026** |
| watchlists | 0 | | alerts / player_events | 0 |
| scouting_reports | 0 | | ingestion_runs | **3 (all SUCCESS, 0 errors)** |
| auth users | 1 | | ingestion_errors | 0 |

What those numbers mean:

- The 2,030 players are the 2,000 newest-active players from the Transfermarkt
  dataset plus the original 30 samples, which carried real Transfermarkt ids
  and were **updated in place, not duplicated** (verified: exactly 30 players
  predate the import; all 235 pre-import valuations retained).
- **2,026 of 2,030 players (99.8%) are resolved through the Reep v1 register**
  — up to 9 provider identities each (Transfermarkt live-site, Wyscout,
  SportMonks, API-Football, StatsBomb, Understat, FBref, plus the Reep entity
  id beside the dataset id).
- Season statistics are counting metrics aggregated from the dataset's
  appearances table (matches, minutes, goals, assists, cards). xG and other
  advanced columns are NULL by design until a licensed provider exists.
- `matches` is 0 by design: match-level import is a deliberate later
  increment; season aggregates carry the current requirement.
- Discovery signals are computed over the full population; the pre-import
  signal history remains retired-in-place with provenance.

### Migrations

All thirteen migrations are applied to the hosted project, and the repository
now reproduces the hosted schema exactly. Three had been applied directly to the
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
| `20260820150000_discovery_view_and_links` | `v_player_discovery`, representation-view fan-out fix, `player_links`, pipeline watchlist statuses (applied to hosted 2026-08-20) |

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

Fourteen routes, all building: `/`, `/login`, `/players`, `/players/[id]`,
`/players/[id]/report/new`, `/compare`, `/clubs`, `/discover`, `/scouting`,
`/watchlists`, `/representation`, `/data`, `/auth/signout`, `/_not-found`.
Auth is enforced for the whole app by `src/proxy.ts`; there is no public
surface.

The scouting experience built on 2026-08-20 (validation record:
[`STAGED_DATA_VALIDATION.md`](STAGED_DATA_VALIDATION.md); design rationale:
[`GBM_BRAND_ANALYSIS.md`](GBM_BRAND_ANALYSIS.md); AI posture:
[`AI_READINESS.md`](AI_READINESS.md)):

- **Dashboard** (`/`) — standing counts, then the scout's own work first:
  Assigned to you, Priority targets (HIGH_PRIORITY or P4+), Recently watched,
  Recent scouting activity (reports + notes), Recommended discoveries, and
  the representation research queue with its NO_AGENCY_LISTED caveat.
- **Discovery** (`/players`) — backed by the `v_player_discovery` view: every
  row carries current-season apps/minutes/goals/assists, per-90s (NULL under
  270 minutes), primary league, value, contract and representation. Filters
  for league/minutes/apps/goals/assists/per-90 floors joined the existing
  identity filters; twelve sorts including lowest value and recently added.
- **Profile** (`/players/[id]`) — header with portrait (initials monogram
  fallback), GBM badge, market value; season-by-season performance table
  with per-90s; market-value chart; contract; honest empty Availability;
  Scouting (reports with pillar ratings + inline notes); transfer history;
  Official links registry; sources; data quality.
- **Compare** (`/compare?ids=`) — 2–4 players, monochrome bars, percentiles
  computed within position cohorts of imported players with 270+ minutes and
  labelled as exactly that.
- **Watchlists** (`/watchlists`) — per-entry status
  (discovered → monitoring → scout requested → high priority → contacted →
  negotiating → represented by GBM / rejected / archived, legacy values still
  selectable), priority P1–P5, assigned scout, reason; edits write through
  RLS and refresh in place.
- **Report form** (`/players/[id]/report/new`) — four pillars, overall +
  potential, strengths/weaknesses/summary, recommendation, draft flag.

Verified 2026-08-20 by an end-to-end Playwright pass against the local stack
holding the same pipeline's data (2,120 players): login → dashboard →
discovery (+U21 filter) → profile → compare → watchlists → report form, at
1440×900 and 390×844, with text assertions on real player data. Production
rendering after deploy is the remaining unverified step. Note for local
testing: RLS grants reads via `gbm_is_member()`, so a local test user needs
an `organization_members` row — password auth alone renders an empty app.

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

1. **Scale beyond the staged 2,000 is deliberately not done yet.** The staged
   import succeeded and verified on 2026-08-20; the full import (~22k active
   players) is a decision, not a code change — run the weekly workflow or a
   manual dispatch without `max_players` once satisfied with the staged data.
   Four of 2,030 players (0.2%) have no Reep v1 match and remain single-source.
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

1. ~~Add the repository secret~~ — done 2026-08-20; ~~run the staged import~~
   — done and verified 2026-08-20 (run `staged-import-once #4`).
2. ~~Review the staged data in the app~~ — done 2026-08-20: 27-player
   scouting validation (`STAGED_DATA_VALIDATION.md`) plus the Playwright
   pass above.
3. ~~Merge the working branch to `main`~~ — done 2026-08-20 (fast-forward;
   fixes the failing Vercel production build, deploys the scouting UI, and
   activates the weekly schedule — capped at the staged 2,000 scope).
   ~~Delete `staged-import-once.yml` and its trigger file~~ — done.
4. Scale in steps (10,000 → full ~22k active) by dispatching
   `data-refresh.yml` with a higher cap (empty = full dataset), or by raising
   the scheduled cap in the workflow — a deliberate act, not the unattended
   default.
5. Decide API-Football Pro ($19/mo) for current-season statistics and injury
   histories; request the Wyscout quote for advanced metrics.
