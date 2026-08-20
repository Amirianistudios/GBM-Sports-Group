# GBM data implementation plan

**Written 2026-08-20**, immediately after
[`GBM_CURRENT_STATE_AUDIT.md`](GBM_CURRENT_STATE_AUDIT.md). The audit's verdict
governs this plan: the architecture exists and is sound; the work is to make
data flow through it, prove it, and automate it. Nothing here redesigns the
database or replaces a working system.

Everything below was checked against live sources today: the Transfermarkt
dataset R2 bucket (HTTP 200, all tables, last published 2026-08-05), the Reep
v1 register (fresh release `20260820T103440Z` published this morning — file
inventory and CSV headers inspected), the live Supabase project, and this
execution environment's actual capabilities (Docker works; no Supabase
credentials are present in the session — which shapes how production writes
happen, see §6).

## 1. Current architecture (what this plan builds on)

```
packages/providers      one FootballDataProvider contract; adapters: Wyscout (dormant),
                        Reep (v0 register), API-Football (connected, unfunded)
services/ingestion      CLI: download → import → resolve → signals → quality → status
                        every write inside an ingestion_runs ledger row
supabase/migrations     48-table schema, live and reproducible
apps/web                12 auth-gated routes; reads only; no service credentials
```

Non-negotiables carried forward unchanged: `players.id` is a GBM UUID and no
provider id is ever a primary key; every fact keeps its provenance; scout
opinion never mixes with provider statistics; ingestion is idempotent (natural
keys, `NULLS NOT DISTINCT`) and observable (`ingestion_runs` opened and closed
even on throw); `NO_AGENCY_LISTED` ≠ unrepresented.

### Where the requested `/data-connectors` structure lives

The brief asks for a `/data-connectors` tree with per-provider folders. That
structure **already exists** under the workspace's two ingestion packages, and
creating a parallel tree would duplicate a working system — exactly what the
brief forbids. The mapping:

| Requested | Actual location | Fetch | Normalise | Validate | Errors | Logging |
|---|---|---|---|---|---|---|
| `/transfermarkt` | `services/ingestion/src/dataset.ts` + `src/transfermarkt/import.ts` | R2 `.csv.gz`, HEAD-revalidated, manifest-tracked | `normalize.ts` (mirrors `gbm_normalize_name()`) | natural keys + `quality.ts` + preflight (new, §3) | per-record `ingestion_errors` | run ledger + console |
| `/reep` | `services/ingestion/src/reep/resolve.ts` (+ `packages/providers/src/reep`) | register download | exact-join only, confidence-scored | unique constraints + known-set dedupe | run ledger | run ledger + console |
| `/api-football` | `packages/providers/src/apifootball/` | rate-limited HTTP, errors-in-200 unwrapped | provider-neutral contract shapes | capability declarations | `ProviderError` | HTTP layer |
| `/statsbomb` | **deliberately absent** | — | — | — | — | — |

**No StatsBomb connector will be built.** Its licence, decoded 2026-08-20
(audit §5 #5), prohibits redistributing the data and commercially exploiting
the data *or any analysis derived from it*, and is revocable without notice.
Building a connector for a commercial scouting platform against those terms
would be constructing a liability. `STATSBOMB` stays reserved in
`ProviderCode`; if counsel ever clears a narrow research use, the contract has
a place for it. Providers are registered as rows in `data_providers` and
adapters behind one interface — no provider is hardcoded into database logic,
and that stays true.

## 2. Existing tables to reuse (no schema changes required)

Every target of this plan already exists and is verified live:

| Data | Tables reused |
|---|---|
| Identity | `players`, `player_external_ids`, `player_aliases`, `entity_resolution_rules` |
| Reference | `countries`, `competitions`, `seasons`, `clubs`, `*_external_ids` |
| Market & contract | `market_values`, `contracts`, `representation_records`, `transfers` |
| Statistics | `player_season_stats` (38 columns incl. xG/xA/duels — this plan fills the counting subset), `seasons` |
| Observability | `ingestion_runs`, `ingestion_errors`, `ingestion_jobs` |
| Signals | `discovery_signals` (recomputed after import) |

The one candidate schema change considered — a `matches`/`player_match_stats`
population from the dataset's `games`/`appearances` — needs **no** schema
change either, but is deferred as a second increment (§3, "later") to keep the
first real import small enough to reason about.

## 3. Ingestion strategy

### Increment 1 (this session): make the existing pipeline real, add counting statistics

**Source: the Transfermarkt dataset (CC0, already integrated).** Verified
today: all tables live on R2, last release 2026-08-05. Its `appearances`
table (`game_id, player_id, date, competition_id, goals, assists, minutes_played,
yellow_cards, red_cards`; 1.6M+ rows) joined to `games` (`game_id → season`)
aggregates cleanly into per-player, per-season, per-competition **counting
statistics**: matches, minutes, goals, assists, cards. That fills
`player_season_stats` for every imported player at zero cost and zero licence
risk, under provider `TRANSFERMARKT_DATASET`.

Honesty rule: only genuinely present metrics are written. xG, xA, duels,
progressive actions stay NULL until a licensed provider (Wyscout or funded
API-Football) supplies them — no derivation, no fakes. `matches_started`
stays NULL too (it lives in `game_lineups`, deferred with match-level stats).

New pieces, all inside the existing structure:

1. `services/ingestion/src/transfermarkt/stats.ts` — streams `games` (build
   `game_id → {season, competition}` map) then `appearances` (filter to the
   just-imported players, aggregate in memory — bounded: ~30k aggregate rows
   for 2,000 players), upserts `seasons` by `(competition_id, name)` and
   `player_season_stats` by its natural key. Appearances in competitions the
   dataset does not describe (e.g. qualifier codes) are counted and reported
   as skipped, never fabricated as reference rows.
2. `data:import --with-stats` (default **on**; `--skip-stats` to opt out) and
   the two extra table downloads in `data:download`.
3. A **preflight command** (`pnpm ingest:preflight`): verifies env credentials
   present, database reachable, expected tables/columns exist (cheap selects),
   migrations ledger non-empty, dataset manifest present and R2 reachable.
   Run automatically at the start of `data:update`; CI fails fast on it.
4. `quality.ts` gains checks: season-stats coverage of imported players,
   multi-provider identity share, seasons referenced by stats exist.

### Increment 1 (this session): Reep v0 → v1

Verified today from the live release `20260820T103440Z` (published 10:39 UTC
this morning — the register refreshes weekly and is one day fresher than the
audit):

```
players.csv.gz    reep_id, status, label, gender, country              (237,427 rows)
bridges.csv.gz    provider, namespace, external_id, reep_id          (5,242,726 rows)
entities.csv.gz   reep_id, entity_type, status, label, …             (1,708,341 rows)
LICENSE.txt       CC0 1.0 (whole release, bridges included)
```

`resolve.ts` is rewritten against this shape, keeping the discipline that made
v0 safe — **exact joins only, nothing fuzzy is auto-written**:

- Pass 1: stream `bridges.csv.gz`, keep only `provider = transfermarkt` rows
  whose `external_id` matches a GBM player's Transfermarkt id → `tm_id →
  reep_id` map (bounded by GBM's player count, not the register's).
- Pass 2: stream again, collect every bridge for the matched `reep_id`s; map
  register provider slugs onto GBM `data_providers` codes (registered
  providers only, exactly as v0 did); write `player_external_ids` rows.
- The Reep identity itself is stored under provider `REEP`, namespace `v1`,
  external id `rp…` — beside the retained v0 rows (`v0-wikidata` namespace),
  which are provenance and are not deleted.
- Writes use `match_method = 'REEP_REGISTER'`, `confidence = 0.99` — aligning
  with the seeded `entity_resolution_rules` row (auto-accept ≥ this method)
  instead of v0's out-of-registry `'REEP'` label.
- The release is pinned by its manifest stamp and checksums into
  `data/manifests/reep.json` (tracked), so every resolve is attributable to an
  exact register version — same pattern as the dataset manifest.

GBM UUIDs remain primary throughout. Provider ids, including `reep_id`,
remain satellite rows in `player_external_ids`.

### Increment 2 (next, not this session)

- Match-level import: `games` → `matches` + per-appearance
  `player_match_stats` (schema already fits; behind a flag; adds ~79k match
  rows + appearance rows for tracked players).
- API-Football enrichment runner (adapter exists): current-season stats and
  injury histories once the $19/mo Pro decision is made and
  `API_FOOTBALL_KEY` exists as a secret. Free tier (seasons 2022–2024) is
  enough to integration-test the runner.
- BeSoccer / Wyscout: blocked on quotes, per the audit.

## 4. Testing strategy

Layered, matching how defects actually escaped before (the audit's defect log:
every prior bug was invisible to typecheck/lint/build and found only by
execution):

1. **Unit** (exists, extended): normalisation contract, CSV streaming; new
   tests for season aggregation (fixture appearances → expected aggregates)
   and Reep v1 row parsing/mapping.
2. **Integration dress rehearsal (new, this session):** a full local Supabase
   stack via Docker (verified working in this environment). All 11 migrations
   applied to a scratch database, the sample seeds applied, then the *actual*
   commands — `data:download`, `data:import --max-players 2000`,
   `reep:resolve`, `signals:compute`, `quality:check` — run against it with
   the real dataset and real v1 register. Success criteria checked by SQL:
   one player end-to-end with identity, multi-provider external ids, club,
   position, market history, statistics, transfers. Reconciliation of the 30
   pre-seeded sample players (they carry real Transfermarkt ids — verified)
   must update, not duplicate.
3. **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` stay
   green; a CI workflow makes them mechanical (§5).
4. **Production verification:** after the staged prod import, the same SQL
   success-criteria checks run against the live project, plus
   `quality:check`, before anything larger is attempted.

## 5. Automation (GitHub-resident, per instruction)

Two workflows in `.github/workflows/` — no Supabase-side scheduling, no
Vercel involvement:

- **`ci.yml`** — push/PR: install → typecheck → lint → test → build.
- **`data-refresh.yml`** — weekly cron (Wednesdays 03:00 UTC, after the
  dataset's typical Tuesday publish) **plus `workflow_dispatch`** with a
  `max_players` input for staged/manual runs. Steps: preflight (fails fast if
  secrets absent or schema unreachable) → `data:update` (download-if-newer →
  import → resolve → signals) → `quality:check` → job summary written to the
  Actions run page. Failure handling: any step failing fails the run loudly
  (GitHub notifies), the `ingestion_runs` row records FAILED with the error,
  and the run log is retained as an artifact. Concurrency-guarded so two
  refreshes never overlap.

Required repository secrets (Settings → Secrets and variables → Actions):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never printed;
ingestion reads them from the environment (`env.ts` already supports exactly
this).

The 12 `ingestion_jobs` rows stay as the declarative ledger: `run.ts` already
stamps `last_run_at`/`last_status` on the matching job row, so the Actions
schedule and the in-database job registry stay consistent without a
Supabase-side scheduler.

## 6. Execution paths, given this environment

This session holds **no Supabase service credentials** (verified: no env vars,
no `.env*`; the MCP bridge deliberately exposes no service key). Consequences,
stated plainly:

- The **local dress rehearsal** (§4.2) runs entirely in this environment —
  Docker is available and pulls images successfully.
- The **production import** runs through the `data-refresh.yml` workflow,
  which is the durable home for these credentials anyway. If the two secrets
  are already configured on the repository, the staged run can be triggered
  and verified this session; if not, the single remaining human action is
  adding them, and the workflow is ready to dispatch.
- Read-side verification of production (row counts, success-criteria SQL)
  works regardless, through the management connection used by the audit.

## 7. Risks

| Risk | Mitigation |
|---|---|
| First real write against the production database | Full dress rehearsal on a scratch stack first (§4.2); staged `--max-players 2000`; pre-import snapshot (§8); idempotent natural keys make re-runs safe |
| Sample players duplicated instead of updated | Their Transfermarkt ids are real (verified against the seed SQL); reconciliation is exercised in the rehearsal before prod |
| Dataset staleness / upstream scraper blocks (last publish 2026-08-05, 15 days ago; repo commits mention scraper blocks) | `checkForUpdate` HEAD revalidation makes staleness visible; weekly workflow reports "already current" rather than failing; staleness is a quality-check, not an assumption |
| Reep v1 provider slugs or schema drift | Release pinned by manifest stamp + checksums; unknown slugs are skipped and counted, never guessed; resolver fails loudly on missing columns |
| Appearances referencing unknown competitions/seasons | Skipped and counted in the run summary — no fabricated reference rows |
| PostgREST payload/latency on tens of thousands of upserts | Existing `upsertChunked` (1,000-row chunks) — already designed for the 600k-row valuations table |
| Workflow secrets misconfigured | Preflight step fails in seconds with a named-variable message before any write |
| Register/dataset licence drift | Both CC0 today (Reep licence re-verified in the release itself); licence recorded per provider in `DATA_SOURCES.md` (step 6) |
| Definition drift (blending provider metrics) | Counting stats only, under their own provider code; advanced columns stay NULL until a licensed source exists |

## 8. Rollback strategy

The current production dataset is tiny (~600 rows across all populated
tables), which makes the rollback plan unusually strong:

1. **Pre-import snapshot.** Before the first production import, every
   populated table is dumped to SQL (management connection, ~600 rows) and
   kept outside Git (live data never enters the repository). Restoring the
   pre-import world is a truncate-and-replay of that file.
2. **Run-scoped attribution.** Every write belongs to an `ingestion_runs` row.
   The import writes only: rows carrying `provider_code =
   'TRANSFERMARKT_DATASET'` (or `REEP*` mappings), plus GBM entities created
   this run. Targeted rollback is `DELETE … WHERE provider_code = …` on the
   satellite tables, then removal of players created by the run (identifiable
   as players whose only external id was written by it) — documented, not
   guessed, because the schema keeps provenance.
3. **Idempotency as the first resort.** Most bad states are fixed *forward*
   by re-running: natural keys mean a corrected import updates in place. Full
   rollback is for a structurally wrong import, not a partial one.
4. **Supabase PITR/backups**, where enabled on the project plan, backstop
   catastrophic error — but the plan above does not depend on them.

## 9. Scale path: 2,000 → full

The staged import proves the pipeline; scaling is then configuration, not new
code: drop `--max-players` (or raise stepwise 2,000 → 10,000 → all 30k+
active), keep `--since-season` to hold the initial scope to current players,
and let the weekly workflow carry increments. Expected full-scale volumes
(from the dataset itself): ~50k players (~22k active 2025), ~660k valuations,
~175k transfers, low hundreds of thousands of season-stat aggregates. All
inside `upsertChunked`'s design envelope; the performance advisors (RLS
init-plan consolidation, FK indexes) get revisited at that point, per the
audit.

## 10. Order of work

1. This plan (committed first, so the work is reviewable against it).
2. Statistics importer + preflight + quality checks + unit tests.
3. Reep v1 resolver + manifest pinning + unit tests.
4. Local-stack dress rehearsal; fix whatever it exposes; gates green.
5. Workflows (`ci.yml`, `data-refresh.yml`).
6. Production: snapshot → staged workflow run (secrets permitting) → SQL
   verification against the success criteria.
7. `DATA_SOURCES.md` licence/commercial-suitability columns; `CURRENT_STATE.md`
   refresh.
