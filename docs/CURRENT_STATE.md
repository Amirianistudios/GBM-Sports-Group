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

Every migration below is applied to the hosted project, and a database rebuilt
from `supabase/migrations/` holds every object the live one does. Three had
been applied directly to the database in an earlier session and existed in
**no file** — `security_hardening`, `natural_key_constraints` and the
intelligence views. They have been captured, so the repository is no longer
missing constraints and hardening the live database has.

The *names* are not one-for-one, and this section used to claim they were; see
the reconciliation under the table for what the two lists actually contain and
why they differ.

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
| `20260821120000_discovery_view_performance` | Cached player columns and indexes behind the discovery view |
| `20260822090000_representation_view_performance` | Representation view cost, identity columns |
| `20260823100000_gbm_opportunity_model` | `gbm_target_markets`, cached opportunity columns, `GBM_OPPORTUNITY` |
| `20260823110000_cache_refresh_where_clause` | Corrects which rows the cache refresh touches |
| `20260823120000_opportunity_score_rescale` | Ends score saturation — 237 players were tied at 100 |
| `20260824100000_gbm_portfolio_and_intelligence` | Role helpers, `gbm_portfolio`, `player_guardians`, `player_news`, `player_live_status`, `v_gbm_portfolio` |
| `20260824110000_gbm_internal_facts_writable` | Narrow `GBM_INTERNAL`-only write grant on values and contracts |
| `20260825100000_search_and_filter_performance` | `v_position_options`, trigram index for wildcard search |
| `20260825110000_write_policies_stop_taxing_reads` | Splits the `FOR ALL` policies off the read path (below) |
| `20260825120000_rls_role_lookups_hoisted_to_initplan` | Wraps every role lookup so Postgres evaluates it once per statement (below) |
| `20260826100000_ai_assessed_fact_state` | `AI_ASSESSED` fact state and the `AVENGERS_GROK` provider at priority 40 |
| `20260826110000_external_intelligence_schema` | `intel_agents`, `intel_submissions`, `intel_reports`, `intel_recommendations`, `intel_adaptation_assessments`; reliability and impact on `player_news` |
| `20260826120000_intel_submission_contract` | `gbm_intel_submit()`, `gbm_intel_resolve_player()`, `gbm_intel_current_agent()` |
| `20260827100000_news_source_types_for_media_and_social` | `NEWS_MEDIA`, `SOCIAL`, `AI_RESEARCH` source types, and the guard that keeps the function's default legal |
| `20260827110000_performance_submissions_without_a_heatmap` | Coalesces `player_season_stats.advanced` so a statistics submission need not carry one |
| `20260827120000_minimal_payloads_survive_every_branch` | Coalesces `source_facts.confidence`; refuses `source_name` and `fact_key` by name |
| `20260827130000_a_model_is_not_a_second_source` | Excludes `AI_ASSESSED` from `player_fact_conflicts`, so a model neither corroborates nor contradicts a provider |
| `20260828100000_guardian_consent_is_recorded_not_inferred` | Consent recorded on `gbm_portfolio`; the minor warning stops depending on the birthday |
| `20260829100000_the_contract_reaches_the_whole_record` | IDENTITY and the record kinds; natural keys for career history and injuries |
| `20260829110000_dispatcher_learns_the_record_kinds` | Points `gbm_intel_submit` at them and widens the accepted kinds |
| `20260829120000_unknown_is_not_an_answer` | `foot='UNKNOWN'` treated as empty; `primary_position` stored verbatim |

Re-checked against `supabase.list_migrations` on 2026-08-27. **The two name
lists are not identical, and the earlier claim here that they were was wrong.**
The hosted project reports 39 migrations against 34 files. Seven applied names
have no same-named file —

`idempotency_constraints`, `intelligence_views`, `discovery_signals_growth_scale`,
`lock_down_ingestion_functions`, `views_security_invoker`,
`representation_view_identity_columns`, `gbm_role_values`

— and two files have no same-named applied migration:
`natural_key_constraints` and `harden_views_and_functions`. This is early-session
consolidation, not lost schema: several small migrations were squashed into
one file under a new name before the repo history settled, so the *effects* of
all seven are present in the files (verified by grepping for each object each
one creates). What is genuinely true is the weaker statement: **every object
the hosted schema holds is created by some file in `supabase/migrations`.** A
name-for-name match is not, and reconciling the names would mean rewriting
history for no gain — but the two lists should not be described as the same
set.

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

Nineteen page routes, all building (Sprint 1 of the product transformation,
2026-08-22, added `/radar`, `/trends`, `/portfolio`, `/team`, `/settings`): `/`, `/login`, `/players`, `/players/[id]`,
`/players/[id]/report/new`, `/compare`, `/clubs`, `/discover`, `/scouting`,
`/watchlists`, `/representation`, `/data`, `/auth/signout`, `/_not-found`.
Auth is enforced for the whole app by `src/proxy.ts`; there is no public
surface.

**Sprint 1 — product transformation (2026-08-22).** The interface moved from
an internal dashboard to a product: a card grammar with elevation and motion
tokens; portraits everywhere via next/image (98.5% of players carry a working
URL; monogram fallback); player cards in grid and list with flags, trends,
contract runway, signals and GBM badges; a tabbed profile (Overview /
Performance / Market / Career / Representation / GBM Notes); the dashboard
rebuilt as an intelligence feed (rising players, emerging U21, contract
opportunities, representation research with its caveat, portfolio strip);
Market Radar (movement and opportunity queries) and Trends (median-based
cohort analytics with visible cohort sizes); four-group navigation
(Intelligence / Scouting / GBM / Organization) with a purpose-built mobile
menu sheet; route-level loading skeletons; pagination via the limit+1
pattern; league display labels; and migration 0015 rewriting
v_representation_opportunities with per-player laterals (dashboard's worst
query: measured 4.6 ms, previously the driver of ~9-11 s TTFB) plus
v_league_options for millisecond filter dropdowns. Login now performs a full
document navigation (a replace-then-refresh race could strand loading
skeletons). The Team page carries the real organization; Portfolio ships an
honest empty state until portfolio management lands — no invented entries.

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

## Sprint 1.5 — product identity and data relevance (2026-08-21)

**The selection bug.** The first staged import ordered by `last_season` desc
and sliced 2,000. Nearly every active player ties on the current season, and
JavaScript's stable sort then fell back to dataset order — Transfermarkt
profile ids, which track career start dates. The result was a veterans
archive: median age 34.5, twenty-five players aged 16–23, none of them under
€5m. `services/ingestion/src/transfermarkt/select.ts` replaced that slice
with GBM's acquisition profile (age curve, target-market leagues and
citizenships, realistic value band, contract window, senior caps) under a
deterministic total order, with 11 regression tests.

**The re-slice import** (`data-import-trigger` run 1 + migrations 0016/0017):
7,835 players, median age 24; 3,605 aged 16–23, of which 2,444 at ≤€5m;
6,343 target-market nationals (81%); 114,450 valuations; 6,020 contracts.
Signals model v2: GBM_OPPORTUNITY (0–100 composite, factors written into
each rationale) for every player, 2,950 contract-expiring, 1,374 rapid
growers, 468 unrepresented-high-potential.

**Data architecture.** `gbm_target_markets` holds the agency's 40 primary
markets as reference data. `players` gained derived cached list columns
(value, 12-month change, season minutes, league, contract expiry,
opportunity score) refreshed by `gbm_refresh_player_caches()` after every
import and signal recompute — list sorts dropped from ~1.2s of lateral-view
evaluation to 0.1ms indexed scans, which is what makes the larger population
navigable. Note: the refresh's whole-table UPDATE needs its always-true
WHERE clause — Supabase's PostgREST path loads pg_safeupdate (0017).

**Product identity.** The interface now ships dark: graphite ground, chalk
type, the white-on-black GBM mark at home, teal/ochre/brick provenance
colours kept, and one brass accent reserved for GBM's own layer (portfolio,
interest, opportunity). The dashboard became the GBM Morning Brief; Discover
became the answer to "who should GBM look at" (opportunity-ranked, market
chips per region); player profiles open with an identity hero — large
portrait, headline facts, and a deterministic GBM Intelligence Summary
assembled only from stored fields (`apps/web/src/lib/summary.ts`, 10 tests
pin its honesty). `/players` defaults to GBM-fit order on the cached fast
path; per-90 and representation filters still use the discovery view.

**Imports by file push.** The GitHub App cannot call `workflow_dispatch`, so
`.github/workflows/data-import-trigger.yml` runs the staged pipeline when
`.github/import-trigger` changes on `main` (shared concurrency group with
the weekly refresh, whose cap rose to 6,000).

**Imagery.** [`PLAYER_IMAGES.md`](PLAYER_IMAGES.md) records the legal
position: dataset-provided portraits hotlinked via next/image with monogram
fallback; no club badges (the dataset ships none, and guessing asset URLs is
scraping); Wikidata/Commons is the Sprint 2 route.

**Production assignment, and how it is now observable.** Twice the live
domain kept serving a build that was not `main`'s head — the first time from
a manual promotion, which pauses Vercel's automatic production assignment
until someone resumes it, and nothing observable from outside said which
commit was live. Every response now carries `x-gbm-release: <commit sha>`
(`apps/web/next.config.ts`), so `curl -I https://gbm-sports-group.vercel.app`
answers that question directly and any future drift is one command away from
being caught.

Verified on 2026-08-22: the domain served `x-gbm-release: 4b3d31c` — then
`main`'s head — and all seventeen authenticated routes returned 200 with
their Sprint 1.5 content markers present (Morning Brief sections, Discover's
opportunity groups, the profile identity hero and GBM Intelligence Summary,
portraits through `/_next/image`, the graphite theme's `--bg:
var(--color-ink)` default). Unauthenticated `/login` renders;
unauthenticated `/players` redirects.

**Read the release header from a dynamic route.** `/login` is statically
prerendered, so Vercel's edge serves it from cache and its `x-gbm-release`
reports whenever that copy was cached (`age: 1390`, `x-vercel-cache: HIT`),
not what is deployed now. `/api/health` and any authenticated page are
`force-dynamic` and answer `x-vercel-cache: MISS` — those tell the truth.

**Still open at the end of Sprint 1.5.** A later merge (`9d83b6a`) did not
reach the domain: 45 minutes on, uncached dynamic routes still reported
`4b3d31c`. Two causes fit, and they cannot be told apart from outside
Vercel — either the production build never ran, or it ran and the domain did
not take it because automatic assignment is still paused from the earlier
manual promotion. The first is now covered: `ignoreCommand` used to skip
whenever `VERCEL_ENV` was anything but the exact string `production`, empty
included, and a skipped build looks identical to one that never started, so
the rule now skips only a confirmed preview and echoes its inputs into the
build log. If production still does not move after that, the cause is the
paused assignment, which is resolved in the dashboard (Deployments → newest
`main` build → Promote to Production, and Resume on any paused-assignment
notice) and nowhere else.

## Execution phase — the agency's own layer (2026-08-22)

**Three real roles, enforced by the database.** `gbm_role` gained
`EXECUTIVE_DIRECTOR` and `PLAYER_SERVICE_SCOUT`; the legacy values remain and
map onto them (`ADMIN` ranks with the executive director, `SCOUT`/`ANALYST`
with the scout), so no existing membership broke. Permission predicates sit on
top — `gbm_can_manage_portfolio`, `gbm_can_manage_staff`,
`gbm_can_view_guardian_data` — and every sensitive surface is gated by RLS
rather than by hiding a component. Verified live: the scout is redirected away
from Add Player, reads **zero** guardian rows where two exist, and is refused
`42501` on write.

Accounts: Mame Amirov (OWNER), Giorgi Amoev Baravi (EXECUTIVE_DIRECTOR),
Antoni Amirian (PLAYER_SERVICE_SCOUT). Created through GoTrue signup so the
passwords were hashed by Auth and never touched SQL, then confirmed and given
their roles by admin statement. No password appears in this repository, in
Vercel, in a fixture or in a log.

**The portfolio is GBM's own record.** `gbm_portfolio` is deliberately separate
from `representation_records`: those are provider assertions carrying
provenance, this is the agency's truth, and an external source omitting a
player never removes a row here. Seeded from what the database already proved —
two players whose current representation record names the agency, each entry
carrying the provider, retrieval date and source URL that asserted it:
Giorgi Kavlashvili (Union Saint-Gilloise) and Giorgi Kutsia (NK Veres Rivne).

Five names supplied by the owner — Fallou Faye, Saba Gegiadze, Saba Asanidze,
Enzo Bagabo, Matthijs Boonen — are **not present in the database at all**, by
exact or fuzzy match. They are not invented into existence; Add Player is the
route for them, with the details only GBM holds.

**Minors.** `player_guardians` holds guardian name, relationship, contact and
consent reference, readable and writable only by owner and executive director.
The Add Player form reveals the guardian section from the entered date of
birth — convenience; the protection is the policy.

**Hourly intelligence.** `.github/workflows/hourly-intelligence-refresh.yml`
runs at :10 past every hour on GitHub Actions — never Vercel. Hourly is the
wake interval, not the request rate: each tracked player carries
`next_check_after`, so quiet players drift towards a daily check while a player
with a fixture in the window is checked hourly. Proven in production across
three runs — first run checked 2 players and updated 2 in 3.1s with zero
errors; the second woke, found both still inside their interval and made
**zero** provider calls (`skipped_inside_interval: 2`); the third derived a
genuine sourced news item (Kavlashvili's 2025-03-21 move, `published_at`
distinct from `discovered_at`). Scope is portfolio plus high-priority
watchlist only; the 7,835-player discovery universe stays weekly, and all three
ingestion workflows now share the `gbm-ingestion` concurrency group.

**A silent failure caught by testing.** Add Player saved a player but lost the
market value and contract typed alongside him: `market_values` and `contracts`
were writable only by the service role, RLS rejected both inserts, and the
action ignored their result. Migration 0022 grants the write narrowly —
portfolio managers may write rows attributed to `GBM_INTERNAL` only, so a
provider's assertion can never be edited or forged through the application —
and the action now reports anything that did not save.

**Known gap, stated rather than hidden.** `matches` and `player_match_stats`
hold zero rows: the Transfermarkt import aggregates appearances into season
totals and never writes per-fixture rows, and no per-match provider is
connected. Latest-match therefore resolves to null and the portfolio card says
so. When a match source is connected the hourly job fills those fields
unchanged.

## Reads stopped paying for the permission model (2026-08-25)

**The regression.** Migration 0021 added `players_manage` and `clubs_manage` as
`FOR ALL` policies. `FOR ALL` is not "for writes" — it covers `SELECT` too, so
every read of `players` began calling `gbm_can_manage_portfolio()` once per row,
and that function queries `organization_members`. Nothing in CI could see it:
the results were correct, the permissions were correct, and a local database is
too small for anyone to notice. It was found by running `EXPLAIN ANALYZE` on
production *as an authenticated user* rather than as the service role.

| stage | plan filter | execution |
|---|---|---|
| service role, no RLS | — | 1.682 ms |
| authenticated, before | `(gbm_can_manage_portfolio() OR gbm_is_member())` | **1546.132 ms** |
| after 0024 splits the write policies | `gbm_is_member()` | 115.905 ms |
| after 0025 hoists the read policy | `(InitPlan 1).col1` | **2.385 ms** |

**Why the last step works.** `gbm_is_member()` and its siblings are `STABLE
SECURITY DEFINER` functions taking no arguments and reading nothing from the
row. Written bare, Postgres treats the call as part of the row filter and
evaluates it per row; written `(select gbm_is_member())` it becomes an InitPlan,
evaluated once per statement. The cost stops scaling with row count altogether,
so this does not decay as the player universe grows.

0025 applies that across the whole schema — roughly sixty policies — rather than
only the two tables where the problem surfaced. Supabase's performance advisor
flags fourteen of these as `auth_rls_initplan`, but it only recognises
`auth.<fn>()` and `current_setting()`; it cannot see the custom role helpers,
which are the expensive ones, since `auth.uid()` reads a GUC while
`gbm_is_member()` runs a query.

**Access is unchanged, and that was verified rather than assumed.** Per-role
visible row counts across all 54 policied tables, for OWNER, EXECUTIVE_DIRECTOR
and PLAYER_SERVICE_SCOUT, are byte-identical before and after. Four policies
needed their predicate restructured, so each was additionally checked with a
truth table over all 8 role states × 4 row states — 0 mismatches. And 0025 ends
with a guard that fails the migration if any policy is left evaluating a role
lookup per row; it earned itself immediately by catching six write policies this
change would otherwise have missed.

**One thing deliberately left undecided.** Four `FOR ALL` policies granted reads
their sibling read policy did not: an OWNER could read another author's private
note, and any writer could read a draft report's sections. Splitting those
policies would have silently revoked those grants, so each is preserved
explicitly in the read policy — visible and reviewable instead of incidental. A
performance migration should change cost, not who can see what. **Whether those
four grants are wanted is an open question for the owner**, and closing them is
a one-line change to each read policy.

**Live effect**, measured against production as a signed-in owner, median of
five requests. `/login` is static and needs no database, so its 0.166 s TTFB is
the network-and-TLS floor from the measuring client; the difference above it is
the real server cost, around 140 ms per route.

| route | total before | total after | median TTFB after |
|---|---|---|---|
| `/` | 2.86 s | ~0.68 s | 0.305 s |
| `/players` | 2.38 s | ~0.67 s | 0.316 s |
| `/discover` | 2.75 s | ~0.58 s | 0.301 s |
| `/players?q=…` | 2.51 s | ~0.57 s | 0.307 s |
| `/portfolio` | ~0.6 s | ~0.56 s | 0.296 s |

## Four languages, and a way to keep the portfolio right (2026-08-23)

**English, Russian, Dutch and Georgian**, chosen in Settings and remembered in
a `gbm-locale` cookie. No dependency was added: `apps/web` must install
standalone whichever Root Directory Vercel uses, and four dictionaries with a
cookie and an interpolator are the whole feature. The locale is a cookie rather
than a `/ru/` URL segment because this is a private authenticated tool — nothing
is indexed, nobody shares a Russian deep link, and a URL scheme would rewrite
every internal href for a preference that belongs to a person, not a page.

`en.ts` defines the key set and the other three are typed as `Dict`, so a
missing or invented key fails the build. Tests cover what types cannot see: no
blank strings, no locale still holding the English text, every `{placeholder}`
preserved (a dropped one silently deletes a number from the interface), and
each locale written in its own script. That last check earned itself — the
Georgian for "except" had been typed in transliteration as `garda`, which a
one-character script test happily accepted; the test now rejects any Latin word
inside Georgian or Russian prose and was confirmed to fail on that exact string.

**Two typography facts the translations forced.** Archivo covers Latin only, so
Russian and Georgian would have fallen back to whatever the device had; Noto
Sans and Noto Sans Georgian are loaded with `preload: false`, and per-glyph CSS
fallback routes each script without any branching in components. And Mkhedruli
has no capital letters, so the `uppercase` plus wide tracking on eyebrow labels
did nothing except pull Georgian words apart — `<html data-uncased>` drops both.

**Georgian confidence.** It is a careful translation, not a certified one. It
should be read once by a native speaker before the interface is shown to a
Georgian-speaking client or a player's family. Nothing but presentation depends
on it.

**Edit Player.** The portfolio could create a record and then never change it,
which is why thirteen of fifteen players held nothing but a name and a
position. `/players/[id]/edit` closes that: identity, club, value, contract,
representation and a portrait URL, restricted to owner and executive director,
with every write attributed to `GBM_INTERNAL` so the agency's own numbers can
never be mistaken for a provider's. Values and contracts upsert on their
natural keys — verified in a rolled-back transaction that two saves leave one
row, not two — and a club GBM names that the dataset never had is created
rather than left as "Club unknown". Each card now says how many of its fields
are still empty.

Wikidata was tried first and does not hold this portfolio; see
[`PLAYER_IMAGES.md`](PLAYER_IMAGES.md) for what was found and why one
year-precision date of birth was deliberately not imported.

## External AI intelligence — the Avengers on Grok Bot integration (2026-08-26)

An external AI scouting team feeds structured intelligence into the platform
through one function. The full specification, written to be handed to that
team, is [`AVENGERS_INTEL_CONTRACT.md`](AVENGERS_INTEL_CONTRACT.md).

**Most of the brief was already modelled.** `player_season_stats` already
carried xG, xA, shots, key passes, progressive passes and carries, dribbles,
duels, aerial duels, tackles, interceptions, clearances, touches in box, saves
and clean sheets, plus an `advanced` jsonb for heatmaps; `player_news` already
held news with source and confidence; profiles, contracts, valuations,
transfers and representation all had homes. Building a parallel schema for any
of that would have split the record in two, so the team writes into the
existing tables with provenance. Only three things genuinely had nowhere to
live: versioned AI reports, recruitment judgements, and adaptation analysis.

**The decision that shapes the design is the priority.** `AVENGERS_GROK` sits
at **40**, below every primary source it can cite — Transfermarkt 85, Wyscout
95, GBM's own knowledge 100. An AI summarising Transfermarkt must not outrank
Transfermarkt. Its value is in the judgement layer, where nothing competes with
it, not in overwriting the record. A test reads the migration and fails if that
priority is ever raised above 50; it was confirmed to fail at 90.

**The agent can write and cannot read.** It is deliberately not an
organisation member, so `gbm_is_member()` is false and every read policy
refuses it. Verified against production: a caller outside
`organization_members` sees **0 rows** in `players`, `gbm_portfolio`,
`player_guardians`, `scouting_reports`, `market_values` and the intel tables —
while `gbm_intel_submit()`, being SECURITY DEFINER, writes normally. An
external system that can contribute intelligence does not thereby gain the
ability to read a minor's guardian contact.

**It never creates a player.** A submission naming someone the database does
not hold is rejected with `UNRESOLVED_PLAYER`. `players.id` is a GBM UUID and
the identity graph is not extended by an external model.

**Claims about the canonical record are assertions, not writes.** A market
value the team reads on Transfermarkt becomes a `source_facts` row attributed
to `TRANSFERMARKT`, where `provider_fact_priority` decides what is displayed
and a disagreement between sources is kept and shown. Where the team is
reasoning rather than quoting, the new `AI_ASSESSED` fact state records that,
so a model's conclusion is never rendered as a verified fact.

Verified end to end in a rolled-back transaction: refuses an unresolved player,
accepts a report, returns `DUPLICATE` on a retry with the same submission key,
supersedes correctly (2 versions, 1 current), accepts recommendations and
adaptation assessments, and rejects an unknown kind with the list of valid
ones. Nothing persisted — 7,848 players before and after.

The player profile gained an **AI Intelligence** tab, separate from GBM Notes
and from scouting reports, stating on every item who produced it and what it
read. A report submitted with no sources is labelled "Opinion — no sources
cited" rather than dressed as research.

### The news path, and two faults found in it

`player_news` was being written and never read: the table was only ever
`count`ed, on the sync-status page. Every news item the external team filed —
with the reliability and impact the brief asks for — would have been stored
where nobody could see it. **Overview → News and signals** now renders it:
headline, source (linked), date, summary, reliability, an impact badge, and
the impact note. It sits on Overview rather than in the AI Intelligence tab
because the same table also holds items from GBM's own hourly connectors, and
that tab's disclaimer would misattribute them; each row instead says which of
the two collected it.

Surfacing it exposed two faults, both of which would have hit the external
team on their first submission:

- **The submit function's own default was illegal.** `gbm_intel_submit()`
  defaults `source_type` to `AI_RESEARCH`, which the `player_news` CHECK
  constraint did not allow. Every NEWS submission omitting the field — the
  common case — was refused. The two live in different migrations, so neither
  file was wrong on its own and nothing had exercised the path.
- **News and social media had no source type.** The allowed set was written
  for the hourly connectors (club, federation, provider API, RSS, dataset,
  manual). A newspaper report or a post on X had to be filed as `RSS`, which
  records the transport and loses the source — for a responsibility area whose
  name is *news and social monitoring*.

Migration 0029 adds `NEWS_MEDIA`, `SOCIAL` and `AI_RESEARCH`, and carries a
guard that re-derives the function's default and fails if the constraint does
not allow it. `intel-contract.test.ts` pins the same agreement in CI, and was
confirmed to fail when the fault is reintroduced. Verified against production
in a rolled-back transaction: a NEWS submission with no `source_type` is now
`ACCEPTED` and stores `AI_RESEARCH`; `NEWS_MEDIA` and `SOCIAL` are accepted;
an invalid value is still `REJECTED`.

The contract document had shipped the invalid value `CLUB_OFFICIAL` in its
NEWS example — the constraint says `OFFICIAL_CLUB` — so copying the documented
example would have failed. Corrected, with the full allowed list beside it.

### The same mistake, three times

Finding one bug in an untested branch was reason to exercise the others.
`PERFORMANCE` and `FACT` had never been run, and both were broken in exactly
the way `NEWS` was: **a column that is `not null default <x>`, handed an
explicit NULL.** Naming a column in an INSERT and giving it NULL does not fall
back to the DEFAULT — Postgres raises. Each branch worked whenever the
optional field happened to be present, and failed on the ordinary payload that
omitted it:

| Branch | Column | Effect |
|---|---|---|
| `NEWS` | `player_news.source_type` (`AI_RESEARCH` not in the CHECK) | every submission omitting `source_type` refused |
| `PERFORMANCE` | `player_season_stats.advanced` (`not null default '{}'`) | every submission without a heatmap refused |
| `FACT` | `source_facts.confidence` (`not null default 0.800`) | every submission without an explicit confidence refused |

The first `PERFORMANCE` test happened to include a heatmap and the first
`FACT` test happened to include a confidence, which is why both looked fine.

Rather than wait to trip over a fourth, every not-null column these branches
write was checked against the expression supplying it. The rest are safe:
`player_id`, `agent_id`, `entity_type` and `provider_code` come from the
caller's identity or a coalesce; `headline`, `report_type`, `recommendation`,
`content_hash`, `sections` and `sources` already coalesced; `is_current`,
`version`, `created_at` and `retrieved_at` take defaults or literals.

Two columns are genuinely required and have no default —
`player_news.source_name` and `source_facts.fact_key`. Neither may be
invented, so both are now refused by name with `MISSING_REQUIRED_FIELD` and a
reason, instead of surfacing a Postgres constraint message as `WRITE_FAILED`.

Migrations 0030 and 0031 carry the fixes and a guard each that re-reads the
installed function. Six `it.each` cases in `intel-contract.test.ts` pin the
coalesces and the required-field checks; all three were confirmed to fail when
the faults are reintroduced. Verified against production, rolled back:

```
REPORT{}=ACCEPTED; REC{}=ACCEPTED; ADAPT{}=ACCEPTED; PERF{}=ACCEPTED;
NEWS{}=REJECTED/MISSING_REQUIRED_FIELD/source_name; NEWS{source_name}=ACCEPTED;
FACT{}=REJECTED/MISSING_REQUIRED_FIELD/fact_key; FACT{fact_key}=ACCEPTED;
fact confidence default = 0.800; fact state = AI_ASSESSED
```

`PERFORMANCE` was also checked for idempotency: resubmitting the same natural
key updated in place (one row, `goals` 7 → 9, `matches_played` preserved at 20)
rather than duplicating. Nothing persisted — 7,848 players, and the single
pre-existing connector news row, untouched.

**The lesson worth keeping:** a branch nobody has run is not "probably fine".
All three of these would have surfaced as the external team's first
submissions failing, on the platform's own contract, with the platform
appearing to work.

### A model is not a second source

A `FACT` submission lands in `source_facts` next to the providers, and two
surfaces read that table without asking what kind of row they were looking at:

- The **corroboration stripe** on the player header counts rows per fact key.
  A model that read Transfermarkt and repeated its value would have become a
  second source agreeing with Transfermarkt — one source shown as two, on the
  exact surface a scout uses to judge how well attested a number is.
- **`player_fact_conflicts`** reports a conflict wherever the distinct values
  exceed one. A model that got a value wrong would have raised *"Sources
  disagree"* against the site it was summarising, presenting its own error as
  a disagreement between two providers.

Both were written when every row in `source_facts` came from a provider, so
grouping them all was the same as grouping providers. That stopped being true
the moment the AI team could write there. Migration 0032 excludes
`AI_ASSESSED` from the view and `factSources()` excludes it from the count.
Nothing is discarded — the row stays in `source_facts`, and
`provider_fact_priority` still decides what is displayed. It simply does not
get a vote on whether two providers agree.

Proven against production, rolled back:

```
one provider                 -> conflicts=0
AI repeats it                -> corroborating sources=1 (not 2), rows retained=2
AI disagrees                 -> conflicts=0
two providers disagree       -> conflicts=1, listing FBREF and TRANSFERMARKT only
```

The view kept `security_invoker=on` and stayed unreadable by `anon` across the
replace; the migration asserts both rather than assuming them, because this
view was one of the five that leaked to `anon` before 0007.

### Making the path observable

`CLAUDE.md` holds ingestion to being idempotent *and observable*. The
submission contract was idempotent from the start, but nothing on the platform
showed it working — an agent whose submissions were all being rejected looked
exactly like an agent that had sent nothing, which is precisely the state the
four faults above would have produced.

**Sync status** now carries an *External intelligence* block: registered
agents with their scopes and when each was last seen, and the last 25
submissions with kind, outcome and, where refused, the reason. The reason is
the point — a bare count would have hidden every one of those faults.
`DUPLICATE` is shown neutrally rather than as a failure, because a retry
returning the first answer is the contract working as designed.

### The contract now reaches the whole record

The submission contract could write seven tables. Everything else a research
team gathers — identity, height, foot, position, the club, career history,
transfers, contracts, valuations, the agent, injuries — had either no route at
all or a route into `source_facts` that nothing displays. **An agent could
file a perfect record for all fifteen GBM players and every profile would
still render blank.** Verified before changing anything: no trigger and no
function anywhere promoted a fact into the canonical record.

Migrations 0034–0035 close that. `IDENTITY` fills `players`, and `VALUATION`,
`CONTRACT`, `TRANSFER`, `REPRESENTATION`, `INJURY` and `CAREER` write the
provider-keyed record tables. `player_team_history` and `player_injuries`
gained the natural keys they lacked, without which a second run would have
duplicated rather than updated.

**The rule that makes it safe is `coalesce(existing, submitted)`** — a column
is filled only where it is currently NULL. Transfermarkt or a GBM entry always
wins, and re-running can never change a field someone has since corrected.
Every supplied field is also written to `source_facts`, which is what lets the
interface mark an AI-sourced value as AI-sourced. Verified against production,
rolled back: a first submission filled `birth_place, foot, height_cm,
shirt_number, weight_kg`; a second carrying deliberately wrong values (height
999, foot LEFT, position Goalkeeper) filled nothing and changed nothing.

Two faults were caught in that verification, both of which would have wasted
the exercise silently:

- **`foot = 'UNKNOWN'` is the column saying it has no answer, not an answer.**
  984 players carry it, 8 of them in the GBM portfolio, and a plain coalesce
  treated the placeholder as a real value — so preferred foot could never have
  been corrected for any of them.
- **`primary_position` is stored verbatim in Transfermarkt's title case**
  (`Centre-Back`, `Goalkeeper`). The first draft upper-cased submissions, which
  would have created a second vocabulary and split the discovery filter.

An image submitted without `image_credit` is refused by name. The platform
cannot verify a licence, but it can decline to store a picture nobody has
attributed.

**Not accepted:** match-level statistics. `player_match_stats` hangs off a
`matches` row, `matches` is empty by design, and its unique key treats a NULL
`match_id` as distinct, so submissions would duplicate on every run. Season
aggregates and heatmaps work today through `PERFORMANCE` and
`player_season_stats.advanced`.

**A sourcing limit that is not a storage limit:** SofaScore, FotMob and FBref
are downstream Opta licensees that cannot sublicense. The xG and heatmap
columns will hold the data; obtaining it by scraping those sites breaches
their terms, and that applies to an external agent exactly as it applied to
GBM's own connectors.

**Open for GBM:** issue the agent's Supabase account and set its `scopes`
(start with `NEWS` and `REPORT`), and decide whether AI recommendations should
appear immediately or pass through a review queue first.

## The repo stopped matching the database (2026-08-28)

Sixty-four migrations were recorded in Supabase against forty-one files in
`supabase/migrations/`, and twenty objects existed in production that no repo
file created — six tables, one view and thirteen functions, most of them the
SofaScore/Transfermarkt ingestion built directly against production by a
parallel session, three of them earlier work here that was applied and never
written down. A rebuild from the repo would not have produced production, and
nobody had reviewed any of it because there was nothing to review.

What the missing review had let through, found by the Supabase linter and a
read of the catalog, and fixed in migration 0043:

- **Nine SECURITY DEFINER functions with no authorisation check, executable by
  `anon`** — the unauthenticated role whose key ships in the browser bundle.
  Among them `gbm_merge_player` and `gbm_merge_club`, which delete rows, and
  `claude_compute_percentiles` and `claude_write_reports`, which need no
  identifiers to call. EXECUTE revoked from `public`, `anon` and
  `authenticated`; they are driven from privileged SQL, not from the API.
- **`sofascore_tournaments` with RLS disabled**, granted to `anon`.
- **`v_claude_candidates` as a SECURITY DEFINER view** — it exposes name, date
  of birth, nationality, market value and agency per player, and evaluated RLS
  as its creator rather than its reader.
- **Thirteen functions with a mutable `search_path`**, including the one that
  authenticates the agent token against a table by name.
- **The agent token stored in plaintext**, in a table granted to `anon` and
  `authenticated` with RLS-and-no-policies the only thing denying them. Now a
  SHA-256 digest; the caller sends the same string and the function hashes it
  before comparing, so nothing had to be coordinated.

Migration 0044 captures all twenty objects, transcribed from the live catalog.
It has **not been executed** — the objects already exist, and applying a
transcription over working production functions risks more than it proves.
What was verified instead: all fourteen function bodies hash identically to
`pg_proc.prosrc` after normalising comments and whitespace, and the view's 47
output columns match in name and order. Validate the file on a Supabase
preview branch before any rebuild depends on it.

Left deliberately in place, flagged rather than taken:

- `staging_ingest` keeps its unauthenticated INSERT policy, restricted to
  three source values. It is the external scraper's drop-box and `anon` cannot
  read, update or delete through it; removing it would break a running
  collection.
- `claude_tm_queue` keeps `anon` EXECUTE, because the token is its
  authentication.
- Supabase's default TRUNCATE grant is held by `anon` on 71 tables and
  `authenticated` on 76. TRUNCATE is never filtered by RLS — but PostgREST
  exposes no TRUNCATE and both roles are NOLOGIN, so there is no request that
  reaches it. Narrowing it schema-wide is a deliberate decision with an API
  re-test attached, not a side effect of a capture.

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
4. ~~Scale in steps~~ — superseded 2026-08-21: population re-sliced to
   6,000 under GBM priority selection (7,835 total with the original set);
   further scaling happens by editing `.github/import-trigger` with a higher
   cap, a deliberate act.
5. Decide API-Football Pro ($19/mo) for current-season statistics and injury
   histories; request the Wyscout quote for advanced metrics.
