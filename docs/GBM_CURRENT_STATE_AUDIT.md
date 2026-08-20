# GBM Intelligence — current state audit

**Audit date: 2026-08-20.** Every claim below was verified this session against a
primary source: the repository at commit `050f036` (a fresh clone), the live
Supabase project queried directly over SQL and the management API, and the five
build gates re-run from scratch. Where this audit confirms an existing document
it says so; where it found something the documents do not say, it is marked
**NEW**. Nothing is carried over on trust.

Scope, per instruction: **GitHub and Supabase only.** No deployment was
triggered, no hosting configuration was read or modified, and nothing in this
audit requires either. Vercel is mentioned only where repository documents
reference it.

Companion documents — this audit verifies them rather than replacing them:

| Document | Holds |
|---|---|
| [`CURRENT_STATE.md`](CURRENT_STATE.md) | Verified facts and row counts as at 2026-08-19 |
| [`DATA_SOURCES.md`](DATA_SOURCES.md) | One-page provider decision matrix |
| [`DATA_SOURCE_RESEARCH.md`](DATA_SOURCE_RESEARCH.md) | Evidence behind every provider verdict |
| [`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md) | The under-18 legal position and required safeguards |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Architecture, environment variables, workflow |

---

## 1. Verdict

**The platform the project brief describes already exists as a foundation, and
it is better designed than the brief itself.** The requested database direction
— GBM-owned player identity, external provider IDs as satellites, season and
match statistics, injuries, scouting reports, shortlists — is not a proposal to
evaluate; it is the schema that has been live in Supabase since 2026-08-19,
usually with more columns than the brief asks for. The requested data-source
investigation (Transfermarkt datasets, Reep, StatsBomb, the Kaggle mirrors) was
completed on 2026-08-19 across nine sources with verdicts recorded in
`docs/DATA_SOURCES.md`.

What is missing is not design. It is **execution and hardening**:

1. **The statistics tables are empty.** `player_season_stats`, `matches`,
   `player_match_stats`, `player_injuries`, `transfers` all hold 0 rows. The
   platform currently holds 30 hand-generated sample players.
2. **The ingestion pipeline has never run against the database.**
   `ingestion_runs` is 0. The importer, resolver and signal computation exist
   and typecheck, but only the SQL side has been executed in anger.
3. **Cross-provider identity is unproven.** All 30 players carry exactly one
   external id (`TRANSFERMARKT_DATASET`), and the Reep resolver is pinned to a
   register frozen since 21 June 2026 (v1, with 3.8× the entities, is live and
   free).
4. **Nothing runs on a schedule.** The 12 `ingestion_jobs` rows are
   declarative placeholders — no scheduler (GitHub Actions, pg_cron or
   otherwise) executes them.
5. **No CI and no integration tests.** The build gates pass but only local
   discipline enforces them; the importer has never been tested against a
   scratch database, which is exactly how five SQL defects previously reached
   the repository.

The correct next move is therefore not to build new systems. It is to **run
what exists, prove it end-to-end, and put automation around it** — then extend
along the roadmap in §9.

Explicitly out of bounds, confirmed still true and to be kept true:

- Do not redesign the schema. It already exceeds the brief.
- Do not build a second ingestion path, identity system or scouting model
  beside the existing ones.
- Do not touch Vercel or any hosting configuration. Application changes reach
  the world by being pushed to `main`, nothing else.
- Wyscout stays unconfigured (adapter exists, deliberately dormant).

---

## 2. Repository audit (GitHub)

### 2.1 Repository, branches, history

| Fact | Verified value |
|---|---|
| Repository | `Amirianistudios/GBM-Sports-Group` (private) |
| Default branch | `main` |
| Branches | `main`, `claude/gbm-project-audit-b4dzzs` (this audit) |
| Pull requests | **None, ever** — all six commits landed directly on `main` (**NEW**) |
| CI / GitHub Actions | **None** — no `.github/` directory exists (**NEW**) |
| Git ↔ data hygiene | Raw datasets git-ignored; no secrets or `.env*` tracked — confirmed clean |

Full history (six commits, one day of work, 2026-08-19 → 2026-08-20):

| Commit | Message |
|---|---|
| `4bce10e` | feat: establish GBM Intelligence platform foundation |
| `a2a18c9` | fix: make GBM Intelligence production build deployable |
| `97c2fcc` | fix: close anonymous read path and repair ingestion defects |
| `222ed8d` | docs: record provider research — the free tier is closed for advanced metrics |
| `3e582cd` | docs: complete provider research — nine sources assessed |
| `050f036` | feat: connect API-Football provider |

The last commit postdates `CURRENT_STATE.md` (last verified 2026-08-19). This
audit covers what it added: the API-Football adapter, its connectivity probe,
and the corresponding documentation updates.

### 2.2 Workspace structure

pnpm workspace, five projects, `pnpm@11.22.0`, Node ≥ 20:

| Package | Purpose | State |
|---|---|---|
| `@gbm/web` (`apps/web`) | Next.js 16.3.1 (Turbopack) · React 19 · TypeScript 5.9 · Tailwind 4, mobile-first PWA | Builds; 12 routes |
| `@gbm/providers` | Provider adapters behind one `FootballDataProvider` contract | 3 adapters + shared HTTP layer |
| `@gbm/database` | Generated Supabase types, committed | In sync with `apps/web` copy (verified byte-identical line counts) |
| `@gbm/ingestion` (`services/ingestion`) | Dataset download, import, entity resolution, signals, quality | Complete, never run against the DB |
| root | Orchestration scripts, vitest config | — |

Deliberate architectural choice, confirmed intact: **`apps/web` has no
`workspace:*` dependencies**, so it installs and builds standalone regardless
of build-root configuration. It keeps its own copy of the generated database
types for the same reason; `pnpm db:types` writes both copies.

**NEW — note for future contributors:** `apps/web/AGENTS.md` (auto-generated by
`next dev`) warns that Next.js 16 has breaking changes relative to most prior
knowledge and points to `node_modules/next/dist/docs/` as the authority. Any
future work on the web app should read those docs first.

### 2.3 Build gates — re-verified today

Run in this session from a fresh clone at `050f036`, exit code 0:

| Gate | Result 2026-08-20 |
|---|---|
| `pnpm install` | passes — 5 workspace projects |
| `pnpm typecheck` | passes — all 4 packages |
| `pnpm lint` | passes — 0 errors, 6 warnings (unused vars, known) |
| `pnpm test` | passes — 14 tests, 2 files (`normalize`, `csv`) |
| `pnpm build` | passes — 12 routes compiled |

This independently re-confirms the build-status table in `CURRENT_STATE.md`
after the API-Football commit.

### 2.4 The web application

Twelve routes, all auth-gated by `apps/web/src/proxy.ts` (Next.js middleware):
`/`, `/login`, `/players`, `/players/[id]`, `/clubs`, `/discover`, `/scouting`,
`/watchlists`, `/representation`, `/data`, `/auth/signout`, `/_not-found`.

Auth quality is above baseline: the middleware calls `supabase.auth.getUser()`
(server-side token revalidation) rather than trusting the session cookie, and
redirects unauthenticated requests to `/login`. **There is no public surface**
— a property the youth/minors compliance position in `YOUTH_AND_MINORS.md`
depends on.

The app reads through the anon key + RLS only; it holds no service-role
credentials. Reads use the `v_*` analytical views and base tables. Surfaces
that show representation status carry the `NO_AGENCY_LISTED` caveat, which is a
non-negotiable of this codebase.

### 2.5 Provider layer (`packages/providers`)

One contract, `FootballDataProvider` (417-line `types.ts`), with three design
rules that hold up well against everything learned in the provider research:
capabilities are **declared, not discovered by failing**; every record carries
provenance (`provider`, `sourceUrl`, `retrievedAt`, optional `raw`); providers
return provider-shaped string ids and never mint GBM identities.

| Adapter | Lines | State |
|---|---|---|
| `wyscout/` | 782 | Written against the real OpenAPI v3 spec (`docs/wyscout-openapi-v3.yml`); **unconfigured by design**, no code path requires it |
| `reep/` | 231 | Registry provider over the downloadable v0 register |
| `apifootball/` | 490 | **NEW since CURRENT_STATE.md.** Verified live on 2026-08-19 (Haaland 2024/25: 32 apps, 2741 min, 22 goals). Capabilities declared honestly: season/match stats, injuries, cards, duels, tackles, rating — but `getTransfers`, `getMarketValues`, `getContractInformation`, `getRepresentationInformation` all `false` because the API genuinely lacks them. Treats a populated `errors` field inside HTTP 200 as a thrown error (the API reports plan violations that way). Free plan is limited to seasons 2022–2024; current-season use requires Pro at $19/mo. `getInjuries` carries a pointer to the under-18 Article 9 prohibition. |

Plus `http.ts` (207 lines): shared fetch layer providing queued rate limiting,
retry with backoff, and honest user-agent identification of the caller.
`ProviderCode` reserves codes for every assessed source, including the rejected
ones — deep links to Sofascore/FotMob/FBref profiles remain legitimate manual
scout actions even where ingestion is barred.

### 2.6 Ingestion service (`services/ingestion`)

CLI-driven (`tsx`), seven commands wired in the root `package.json`:

| Command | Does |
|---|---|
| `pnpm data:download` | Fetches the per-table `.csv.gz` Transfermarkt dataset from its published R2 bucket; writes a manifest |
| `pnpm data:import` | Normalises into the canonical model, reconciling through `*_external_ids` so re-runs update rather than duplicate; supports `--max-players`, `--since-season`, skip flags |
| `pnpm data:update` | Download-if-newer → import → resolve → signals |
| `pnpm reep:resolve` | Joins the Reep register on Transfermarkt id; writes confidence-1.000 identities for 10 providers plus the Wikidata QID under `REEP`/`v0-wikidata`; bumps `data_confidence` |
| `pnpm signals:compute` | Recomputes discovery signals set-based in SQL (`gbm_compute_discovery_signals()`) |
| `pnpm quality:check` | Nine data-quality checks (players present, DOB coverage, orphaned ids, transfers/valuations present, stale representation, failed runs…) |
| `pnpm ingest:status` | Recent runs and row counts |

Design properties verified by reading the code, not just the docs:

- Every writing command opens an `ingestion_runs` row and closes it even on
  failure.
- GBM UUIDs are minted client-side (`randomUUID()`), eliminating the
  insert-order pairing bug found and fixed earlier.
- The importer adopts pre-existing entities by natural key (clubs by unique
  name, competitions by name+area) so a partial database never aborts a run.
- `normalize.ts` mirrors the database's `gbm_normalize_name()`; the contract is
  pinned by `normalize.test.ts` — change one side, change both.
- The Reep resolver is **exact-join only** (Transfermarkt id → Transfermarkt
  id); nothing fuzzy is auto-written. Fuzzy methods exist only as
  `entity_resolution_rules` rows with `auto_accept=false`.

**Confirmed gap:** `services/ingestion/src/reep/resolve.ts:28` hardcodes the
frozen v0 register URL (`raw.githubusercontent.com/withqwerty/reep/main/data`).
See §5.

### 2.7 Data, scripts, environment

- `data/sql/` holds five generated sample-seed files. Four were applied to the
  hosted project during the initial build; `04_transfers_01.sql` never was —
  which is exactly why `transfers` is 0.
- `data/transfermarkt/` (git-ignored) held the 2026-08-05 dataset release
  locally on the original machine; a fresh clone (like this one) starts empty
  and re-fetches via `pnpm data:download`.
- Environment variables: no `.env*` is tracked (correct). The authoritative
  name list lives in `DEPLOYMENT.md` — web app needs only
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; ingestion needs
  `SUPABASE_SERVICE_ROLE_KEY` (never exposed to the web project);
  `API_FOOTBALL_KEY` and `REEP_*`/`WYSCOUT_*` are tooling-side only.
  `.env.example` is still missing (the original machine's permission
  configuration blocked writing it — an environment quirk, not a decision).

---

## 3. Supabase audit (live project)

### 3.1 Project

| Fact | Verified value |
|---|---|
| Project | `GBM Intelligence`, ref `tyzndcjuiffnyhluddce` |
| Region / status | eu-west-2, `ACTIVE_HEALTHY` |
| Postgres | 17.6.1.155 |
| Database branches | **None** — the single project is production (**NEW**) |
| Edge functions | None (**NEW**) |
| Storage buckets | 0 — player images are stored as provider URLs, never mirrored (consistent with the youth-data position) |
| Auth users | 1 |

A second project (`KAVKAZ/MIXMARKT`) exists in the same Supabase organization.
It is unrelated to GBM and was not touched.

### 3.2 Schema — 48 tables, all with RLS enabled

The schema divides into five coherent groups (all verified against
`information_schema` and matching `supabase/migrations/` exactly):

**Reference & identity** — `countries`, `competitions`, `seasons`, `clubs`,
`players`, plus `*_external_ids` for competition/season/club/player/match, plus
`player_aliases`, `club_aliases`, `player_team_history`, `data_providers` (18
registered providers), `provider_fact_priority` (22 per-fact trust rankings —
display precedence is decided per fact, never one global winner).

`players` carries more than the brief asks for: names (full/short/first/last/
normalized), DOB, birth country/place, dual nationality, height, weight, foot,
primary + secondary positions, current club, shirt number, goalkeeper flag,
image URL, `gbm_status`, `data_confidence`, `is_retired`, `last_enriched_at`.
**`players.id` is a GBM UUID; no provider id is a primary key anywhere.**

**Football facts** — `matches`, `player_season_stats` (38 columns: appearances,
starts, minutes, goals, assists, cards, xG, xA, shots on/off target, key
passes, passes ± accurate, dribbles ± successful, duels ± won, aerial duels ±
won, interceptions, tackles, clearances, progressive passes, progressive
carries, touches in box, GK saves/conceded/clean sheets, and an `advanced`
JSONB for anything provider-specific), `player_match_stats`, `transfers` (with
fee, currency, raw club names retained), `contracts` (start, expiry, option,
loan), `market_values`, `representation_records`, `player_injuries` (type,
dates, expected return, games missed), `player_national_team_records`.

**Provenance, ingestion, resolution** — `source_records` (immutable raw
payloads, unique on provider+resource+id+payload-hash), `source_facts` (90
rows: per-fact provenance with typed value columns, state, confidence,
`is_current`), `ingestion_jobs` / `ingestion_runs` / `ingestion_errors`,
`entity_resolution_candidates` / `entity_resolution_reviews` /
`entity_resolution_rules` (7 seeded match methods; only ≥0.93-confidence
deterministic methods carry `auto_accept=true`; name-similarity alone is capped
at 0.40 and can never auto-merge).

**GBM workspace** — `organizations` / `organization_members` / `profiles` (auto-
created on signup via trigger), `watchlists` / `watchlist_players` (status,
priority, `assigned_scout_id` — the brief's "shortlists", already with scout
assignment), `player_notes`, `tags` / `player_tags`, `scouting_reports`
(technical/tactical/physical/mental, strengths, weaknesses, summary,
recommendation, overall + potential rating, draft flag, observed context),
`scouting_report_sections`, `scout_player_ratings` (per-attribute, unique per
scout). **Scout opinion lives here and only here — it never mixes with
provider statistics**, exactly as the platform rules require.

**Analytics & signals** — `player_percentiles`, `player_rankings` (both
scaffolded, empty — the landing zone for the analytics layer),
`discovery_signals`, `player_events`, `alerts`.

### 3.3 Row counts — verified 2026-08-20

Identical to `CURRENT_STATE.md` (2026-08-19) with one explained difference:

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| players | 30 | | source_facts | 90 |
| player_external_ids | 30 | | source_records | 0 |
| clubs / club_external_ids | 50 / 50 | | transfers | **0** |
| competitions (+ext ids) | 10 / 10 | | matches / player_match_stats | 0 / 0 |
| countries | 35 | | player_season_stats | **0** |
| market_values | 235 | | player_injuries | 0 |
| contracts | 30 | | entity_resolution_candidates | 0 |
| representation_records | 30 | | ingestion_runs / errors | **0** / 0 |
| data_providers | 18 | | ingestion_jobs | 12 |
| provider_fact_priority | 22 | | entity_resolution_rules | 7 |
| discovery_signals | **62** | | watchlists / scouting_reports | 0 / 0 |
| organizations / members / profiles | 1 / 1 / 1 | | percentiles / rankings / alerts / events | all 0 |

The `discovery_signals` count reads 62 where `CURRENT_STATE.md` says 31 —
**both are right**: 31 current rows (`is_current=true`, model `v1`: 1
CONTRACT_EXPIRING, 16 RAPID_VALUE_GROWTH, 14 UNREPRESENTED_HIGH_POTENTIAL) plus
31 retired v0 rows kept with provenance rather than deleted. Verified by
grouping on `is_current, model_version`.

Every seeded/computed table (`data_providers`, `provider_fact_priority`,
`entity_resolution_rules`, `ingestion_jobs`, signals) contains real content;
every provider-fed statistics table is empty. **The 30 players are a
hand-generated sample, not an import** — all 30 carry exactly one external id,
`TRANSFERMARKT_DATASET`, so no cross-provider resolution has ever happened.

**NEW — the `ingestion_jobs` rows are declarative only.** 12 jobs with cron
expressions (Wyscout syncs, Transfermarkt refresh, market values,
representation, contracts, Reep register, entity resolution, signals, change
detection, data quality) all have `is_enabled=true` and `last_run_at=null`.
Nothing executes them: `pg_cron` is not installed, there are no edge functions,
and there is no GitHub Actions workflow. They are a well-designed schedule
*specification* awaiting a scheduler.

### 3.4 Migrations — repo ↔ hosted parity

14 migrations applied on the hosted project; 11 files in
`supabase/migrations/`. The difference is consolidation, not drift — three
early migrations were applied directly to the database and later captured into
files, and two hosted pairs were captured as one file each:

| Hosted (applied order) | Repository file |
|---|---|
| `core_entities` | `20260819120000_core_entities.sql` |
| `football_data` | `20260819120100_football_data.sql` |
| `provenance_ingestion_resolution` | `20260819120200_provenance_ingestion_resolution.sql` |
| `gbm_workspace` | `20260819120300_gbm_workspace.sql` |
| `rls_and_seed` | `20260819120400_rls_and_seed.sql` |
| `security_hardening` | `20260819120500_security_hardening.sql` |
| `idempotency_constraints` | `20260819120600_natural_key_constraints.sql` |
| `intelligence_views` + `analytical_views` | `20260819125000_analytical_views.sql` |
| `ingestion_idempotency` | `20260819130000_ingestion_idempotency.sql` |
| `discovery_signals` + `discovery_signals_growth_scale` | `20260819130100_discovery_signals.sql` |
| `lock_down_ingestion_functions` + `views_security_invoker` | `20260819130200_harden_views_and_functions.sql` |

Parity was spot-verified structurally rather than assumed: the natural-key
unique constraints exist live (24 unique constraints including
`market_values (player_id, provider_code, valued_on)`,
`source_records (provider, resource_type, namespace, external_id, payload_hash)`,
`player_season_stats (player, season, competition, club, provider)`,
`discovery_signals (player, type, model_version, season)`), all six views run
`security_invoker=on`, and the function ACLs match the hardening migration.

### 3.5 Security posture — verified as the database sees it

- **RLS enabled on all 48 tables; 61 policies; every policy is scoped to
  `authenticated`.** No `anon` policy exists anywhere. Reference and provider
  data are SELECT-only for app users (writes arrive exclusively via
  `service_role` ingestion); workspace tables (watchlists, notes, tags,
  scouting, resolution reviews, alerts, profiles) additionally carry
  member-scoped write policies.
- **Views:** all six (`v_player_current_value`, `v_player_value_trend`,
  `v_player_representation`, `v_representation_opportunities`,
  `v_player_source_coverage`, `player_fact_conflicts`) confirmed
  `security_invoker=on` — the fix for the previously-live anonymous-read
  vulnerability is in place and effective.
- **Functions:** `gbm_compute_discovery_signals`, `gbm_recompute_data_confidence`
  and `gbm_handle_new_user` are executable by `postgres` + `service_role` only
  — the anonymous data-destruction vector via `/rpc/` is closed.
  `gbm_normalize_name` and `gbm_touch_updated_at` are harmless invoker
  functions.
- **Supabase security advisors, current output (NEW):** 4 warnings.
  - 3 × "signed-in users can execute SECURITY DEFINER function" for
    `gbm_can_write()`, `gbm_current_user_role()`, `gbm_is_member()`. These are
    the RLS helper predicates and are *intentionally* callable by
    `authenticated` — they leak only the caller's own role/membership. Accept,
    or tighten cosmetically later. ([lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable))
  - 1 × **leaked password protection disabled** — worth enabling in the
    dashboard (Auth → password security, checks HaveIBeenPwned). One toggle,
    no code. ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
- **Performance advisors (NEW):** 150 lints — 125 INFO, 25 WARN, nothing
  urgent at 30 rows. The WARNs that will matter at 50k players: 14 ×
  `auth_rls_initplan` (policies re-evaluate `auth.uid()` per row — wrap as
  `(select auth.uid())`), 10 × `multiple_permissive_policies`, 1 duplicate
  index. The 80 "unused index" + 45 "unindexed foreign key" INFOs are the
  expected profile of a pre-population schema and should be revisited *after*
  real data lands, not before.
- **Extensions (NEW):** installed — `pgcrypto`, `uuid-ossp`, `pg_trgm`,
  `unaccent`, `pg_stat_statements`, `supabase_vault`, `plpgsql`. Notably **not
  installed but available**: `vector` (pgvector — required for the AI
  similarity roadmap), `pg_cron` (one option for scheduling), `pg_net`,
  `pgmq`, `pgtap` (would enable in-database testing).

### 3.6 Auth

Supabase auth with email/password, 1 user, whole-app enforcement in middleware
(§2.4), automatic `profiles` + organization membership creation on signup via
`gbm_handle_new_user` trigger. No storage, no OAuth providers observed, no
public signup surface in the app (login only).

---

## 4. The brief's proposed database vs what exists

The brief proposes a database direction. Column-level comparison against the
live schema (**every check done against `information_schema`, not the docs**):

| Brief asks for | Exists as | Verdict |
|---|---|---|
| Players: name, DOB, nationality, height, position, foot, club, league, image | `players` (26 cols, incl. dual nationality, weight, secondary positions, normalized name, `data_confidence`) | **Exists, exceeds brief** |
| External IDs: GBM id, provider, provider id, URL, verification date; never a provider PK | `player_external_ids` (provider_code, namespace, external_id, url, confidence, match_method, verified_at/by) + same pattern for clubs/competitions/seasons/matches | **Exists, exceeds brief** (adds confidence + match method + namespaces) |
| Performance stats: matches, minutes, goals, assists, shots, xG, xA, passes, tackles, interceptions, duels, aerial duels, dribbles, cards | `player_season_stats` — every listed metric is a named column; plus progressive passes/carries, touches in box, GK metrics, `advanced` JSONB | **Exists in full — 0 rows** |
| Match data: opponent, competition, date, minutes, performance | `matches` + `player_match_stats` | **Exists — 0 rows** |
| Injuries: type, dates, days/games missed, availability % | `player_injuries` (type, started/ended/expected-return, games_missed). Days missed & availability % are derivable; not stored | **Exists — 0 rows**; availability % = view to add later |
| Scouting: reports, ratings, strengths, weaknesses, recommendations, notes | `scouting_reports` + `scouting_report_sections` + `scout_player_ratings` + `player_notes` | **Exists — 0 rows** (no write UI yet) |
| Shortlists: saving players, assigning scouts, priority, status | `watchlists` + `watchlist_players` (status, priority, assigned_scout_id) | **Exists — 0 rows** |
| GBM Player ID → TM/Sofascore/Wyscout/StatsBomb/FBref ids | Exactly the `players.id` UUID ↔ `player_external_ids` design; Reep bootstraps it. `STATSBOMB` is in `ProviderCode`; Reep carries no StatsBomb key, so that mapping would need fuzzy resolution | **Exists; unproven in data** (30 single-source players) |
| Search "U21 centre-backs in Europe" with filters | `/players` has filter UI; position/age/nationality columns support it; minutes/statistics filters await data | **Partially exists** — blocked on data, not schema |
| Player Intelligence Page | `/players/[id]` shows bio, value chart, contract, representation (with the NO_AGENCY_LISTED caveat), source coverage | **Exists**; stats/injury/report sections will light up as tables fill |
| Comparison tools | Nothing | **Missing** (roadmap) |
| AI preparation (similarity, undervaluation queries) | Nothing yet; `player_percentiles`/`player_rankings` scaffolded; pgvector available but not installed | **Missing** (roadmap §9, phase 6+) |

**Conclusion: design work on the core model would be duplication, not
progress.** The brief's schema is implemented, live, and in three places
(confidence/method on identities, per-fact provider priority, provenance
tables) materially better than what the brief describes.

---

## 5. Data sources — the brief's list, audited

The brief names eight sources to investigate. Nine were already assessed on
2026-08-19 with evidence recorded in `DATA_SOURCES.md` /
`DATA_SOURCE_RESEARCH.md`; this audit **re-verified every one of the brief's
eight against the live web on 2026-08-20** (GitHub pages and release manifests
fetched directly; Kaggle renders a JS shell, so Kaggle-only facts are marked
UNVERIFIED). Two corrections to the existing research emerged and are marked
**CORRECTED** below.

| # | Brief's source | Status after audit |
|---|---|---|
| 1 | `dcaribou/transfermarkt-datasets` | **LIVE — already integrated.** The download/import pipeline is built against its published R2 bucket; the development snapshot was release 2026-08-05 (12 tables, ~228 MB): 50,149 players, 796 clubs, 65 competitions, 175,165 transfers, 656,301 valuations. Fresh check 2026-08-20: actively maintained — latest commit 2026-08-05, automated weekly refresh commits throughout 2026, licence **CC0-1.0**, hosted on Cloudflare R2 (DuckDB + gzipped CSVs) with a Kaggle mirror (the data.world channel was dropped 2026-08-05). Caveats: it is scraped from Transfermarkt, so underlying-rights exposure sits with the consumer regardless of the repo's CC0, and recent commits reference scraper blocks — refresh continuity is not guaranteed. Zero youth competitions — it can never surface a youth player. |
| 2 | `felipeall/transfermarkt-api` | **Research only, as the brief instructs.** MIT, self-hostable FastAPI service that scrapes Transfermarkt pages on demand — an API, not a dataset. Fresh check 2026-08-20 (live `openapi.json`): 13 endpoint paths — competition/club/player search, profiles, market value, transfers, stats, injuries, achievements. **Effectively unmaintained: last commit 2025-04-13, no activity in 16+ months**, so parser rot against Transfermarkt's HTML is a live risk. Assessed indirectly during the SportDB investigation (SportDB resells exactly this route table). Useful as endpoint documentation; building GBM's pipeline on live Transfermarkt scraping would create exactly the fragile dependency the dataset route avoids. No adapter warranted. |
| 3 | `eddwebster/football_analytics` | **Methods reference, not a data source.** A large personal corpus (notebooks, papers, dashboards, curated community links) on player evaluation and metrics. Fresh check 2026-08-20: last commit 2025-10-09 (README touch-ups; last substantive code late 2023) and **no licence file at all — reuse rights are legally undefined**. Mine it for ideas when designing the analytics layer (per-90s, position peer groups, age adjustment); copy no code or data from it, and ingest nothing. |
| 4 | `withqwerty/reep` | **LIVE in GBM — but pinned to the frozen v0 register.** Freeze re-confirmed verbatim from the README on 2026-08-20: last v0 CSV release `2026.25` (21 June 2026), API database took no writes after 25 April 2026, no further refreshes planned; v0 holds 444,707 people. `resolve.ts` joins it deterministically at confidence 1.000 across 10 providers. **Reep v1 re-confirmed live at reep.football on 2026-08-20**: weekly releases (latest observed `20260810T075032Z`, 10 Aug 2026; the 2026-08-19 research recorded a 12 Aug release id — either way the cadence is weekly), **~1.70M entities, 4.95M provider bridges across 54 providers**, CSV + 579 MB DuckDB, manifest at `data.reep.football/releases/latest.json`, and the downloads page **explicitly dedicates the whole release, provider-ID bridges included, under CC0 1.0 with commercial use allowed**. v0 ids are not interchangeable with v1 ids — but GBM never keyed on them, so migration is a new namespace + re-resolve, not a schema change. **Highest-value free action available.** |
| 5 | `hudl/open-data` (StatsBomb Open Data) | **CORRECTED ×2, and the verdict hardens.** (a) The brief's link is the right one: the canonical repo is **`hudl/open-data`** — `statsbomb/open-data` now merely redirects to it after the transfer into the Hudl org. (b) The licence question the research left for a human is now materially answered: **`LICENSE.pdf` ("StatsBomb Public Data User Agreement") was decoded on 2026-08-20.** It designates the data a research tool; prohibits distributing, reproducing or selling it; prohibits **"commercially exploit[ing] the data or any analysis derived"** from it; requires logo attribution in publications; and lets StatsBomb withdraw the service without warning. The "derived analysis" clause reaches further than the research assumed — it puts even the develop-the-methodology-here-then-apply-it-commercially plan in doubt, not just product ingestion. **Do not ingest, and get counsel sign-off before using it even as a methodology corpus.** Coverage (fresh read of `competitions.json`, last data commit 2026-05-26, +1,647 games): broader than the 2026-08-19 research recorded — Bundesliga to 2023/24, Ligue 1 to 2022/23, La Liga to 2020/21, Euro 2024, Copa América 2024, MLS 2023, AFCON 2023, World Cups 1958–2022 — but still nothing current-season and PL still most recently 2015/16, so it remains a corpus of largely unscoutable players. Reep carries no StatsBomb id, so identity would be fuzzy regardless. The brief's own rule — no fake heatmaps, visual analytics only where real event-location data exists — therefore still means: **no heatmaps in the product** until a licensed event feed exists. |
| 6 | Kaggle `davidcariboo/player-scores` | **Duplicate of #1 — confirmed 2026-08-20.** Same author (davidcariboo = dcaribou), and #1's README lists Kaggle as one of its distribution channels; the dataset description matches #1 verbatim (same 12 tables, same weekly cadence). GBM already imports from the R2 bucket, which is closer to the source. Nothing to do. |
| 7 | Kaggle `felipesembay/sofascore-and-transfermarkt-football-data` | **Skip.** The dataset exists (confirmed 2026-08-20), but its update date, file list and licence could not be read (Kaggle serves a JS shell) — treat as an unmaintained static snapshot until proven otherwise. Anything Transfermarkt-side is a stale subset of #1. The Sofascore side inherits the Sofascore problem: Opta-downstream data that cannot be sublicensed — a Kaggle re-dump does not launder the rights (and Sofascore's per-match ratings are not comparable with any other provider's, the exact definition-drift trap the API-Football adapter deliberately avoids). No unique contribution. |
| 8 | Kaggle `saurabhshahane/statsbomb-football-data` | **Skip — use the official repo.** Owned by a bulk re-uploader with what appears to be an automated pipeline (~994 dataset versions observed on 2026-08-20); that it mirrors #5 is plausible but unverifiable through Kaggle's JS shell. If it is a mirror, third-party redistribution appears to *itself* breach the StatsBomb agreement's no-distribution clause — using it would add a provenance problem on top of #5's licence problem. The brief says prefer official sources; correct, and here it is the only defensible option. |

The wider market finding that governs strategy (verified in the research, and
the reason "find another free aggregator" is not a plan): **Opta/Stats Perform
sits upstream of nearly the whole free tier and does not allow sublicensing**
— it closed Sofascore, FotMob and FBref in one move (FBref's advanced data was
deleted outright in January 2026). Advanced metrics must be licensed; Wyscout
is the identified candidate (adapter already written, 63.7% identity coverage
of GBM's active squad via Reep). Meanwhile **API-Football** (connected,
$19/mo Pro for current-season access) is the only near-term path to filling
`player_season_stats`, `matches` and `player_injuries`, and
**Wikipedia/Wikidata youth squads** (CC BY-SA) remain the only clean route
into youth football — gated behind the `YOUTH_AND_MINORS.md` safeguards.

---

## 6. What is useful and reusable

Effectively everything present is reusable; nothing found deserves deletion.

1. **The canonical identity system** — GBM UUID + `player_external_ids` with
   confidence/match-method, resolution rules with auto-accept thresholds. This
   is the brief's #4 requirement, already built the right way.
2. **The provenance layer** — `source_records` / `source_facts` /
   `provider_fact_priority`. Enables "which source said this, and when" on
   every surface, and per-fact display precedence with conflicts shown.
3. **The full migration set** — the hosted schema is reproducible from the
   repository (drift was found and captured in a prior session; parity
   spot-verified again today).
4. **The provider contract** — capabilities-declared adapter interface that has
   now absorbed three very different providers (bulk dataset, registry, REST
   API) without change.
5. **The idempotent importer + run ledger** — natural keys with
   `NULLS NOT DISTINCT`, client-minted UUIDs, adoption by natural key,
   `ingestion_runs` opened/closed even on throw.
6. **The provider research corpus** — nine sources with verdicts and evidence;
   saves weeks of re-derivation and is largely re-confirmed by this audit.
7. **The youth/minors compliance position** — a genuine bright-line design
   input (FA Reg 5.1 → Art 6(1)(f) necessity) most competitors will not have
   written down.
8. **The security hardening pattern** — RLS-everywhere, invoker views,
   locked-down definer functions; re-verified live today.
9. **The web app shell** — 12 authenticated routes with the caveat-carrying
   representation surfaces; ready to light up as data lands.

## 7. What is incomplete

In dependency order, not severity order:

1. **No real data.** 30 sample players; every statistics table 0 rows;
   `transfers` 0 (its seed file was never applied — moot once the real import
   runs).
2. **Ingestion never executed against the database.** The write path is
   unproven; `ingestion_runs` = 0. The staged first run
   (`pnpm data:import --max-players 2000`, then `pnpm reep:resolve`) is
   specified in `CURRENT_STATE.md` §Next and remains undone.
3. **Cross-provider identity unproven in data** (all players single-source),
   and the resolver reads a **frozen register** (Reep v0) — see §5 #4.
4. **No scheduler.** 12 declarative `ingestion_jobs`, nothing fires them; no
   GitHub Actions workflows at all.
5. **No CI.** The five build gates run only by local discipline; no PR flow has
   ever been used.
6. **No integration tests.** Unit tests cover normalisation and CSV parsing
   only; the importer has never run against a scratch database — the defect
   log in `CURRENT_STATE.md` shows exactly this class of bug escaping.
7. **Season-statistics capability is blocked on a paid decision**: current
   season requires API-Football Pro ($19/mo); advanced metrics (xG et al.)
   require a licensed provider (Wyscout quote outstanding).
8. **Scouting/watchlist write UI** — tables and RLS exist; the pages are
   read-only lists so far.
9. **Comparison tools and AI layer** — absent; `player_percentiles` /
   `player_rankings` are empty scaffolds; pgvector not installed.
10. **Youth safeguards are documented but not yet enforced in code** — no age
    gate in the provider/ingestion layer, no minors field-allowlist, no
    `handlesMinors` capability flag, no under-16 suppression in signal
    computation. Not urgent while no youth source is connected; mandatory
    before one is.
11. **Operational odds and ends** — `.env.example` missing; leaked-password
    protection off; mobile viewport pass unverified; `alerts`/`player_events`
    have no producers.

## 8. Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| 1 | **Unproven write path meets production database.** The first real ingestion runs against the only database that exists — no Supabase branch, no staging. A defective run would write junk into prod (mitigated by idempotent natural keys + `ingestion_runs`, but recovery is manual). | High | Stage it: `--max-players 2000` first; take a backup/PITR point first; add the integration-test scratch DB (§9-4). |
| 2 | **Identity graph stops growing silently.** Reep v0 frozen 21 June 2026; every week of new players widens the gap; nothing errors. | High | Migrate to v1 (new namespace + re-resolve). |
| 3 | **No CI + direct-to-main.** A push that skips the gates is a failed deployment (build = deploy gate per `DEPLOYMENT.md`); nothing enforces the gates mechanically, and there is no PR/review step. | High | GitHub Actions workflow running the five gates on push/PR — GitHub-only, no hosting change. |
| 4 | **Licence/compliance drift as sources are added.** `source_records` retains payloads permanently by design — some provider licences (BeSoccer's likely; StatsBomb's decoded no-distribution/no-commercial-exploitation terms) forbid exactly that; API-Football data must never become publicly visible (publication disclaimer). The repo's research flags these; code does not yet enforce any of it. | Medium-High | Record licence terms per provider in `data_providers`; gate ingestion on them. StatsBomb's agreement (decoded 2026-08-20, §5 #5) bars commercial exploitation of the data *and derived analysis* — treat as closed unless counsel says otherwise. |
| 5 | **Youth data legal exposure if sequencing is ignored.** The platform rules (§7-10) must precede any youth source. A repeat of the fixed anon-view defect over a youth table would be a reportable children's-data breach. | High (dormant) | Build the age gate + minors allowlist + read audit *before* the first youth adapter; DPIA first. |
| 6 | **Definition drift across providers.** Blending non-comparable metrics (e.g. API-Football's composite rating vs anyone else's) into one field would corrupt percentiles. The adapter already quarantines it in `advanced`; the discipline must survive future adapters. | Medium | Keep first-class columns for genuinely comparable counts only; percentiles computed per provider per peer group. |
| 7 | **RLS policy cost at scale.** 14 `auth_rls_initplan` warnings (per-row `auth.uid()` re-evaluation) + 10 duplicate-permissive-policy warnings; invisible at 30 rows, real at 50k+. | Medium | One consolidation migration wrapping predicates in `(select …)` when data volume arrives. |
| 8 | **Free-tier development trap.** API-Football free tier serves only 2022–2024 seasons and reports violations inside HTTP 200 — an adapter trusting status codes would read "blocked" as "played no matches". Current adapter handles it; future endpoints must reuse `unwrap()`. | Medium | Contract test pinning the errors-field behaviour. |
| 9 | **Two copies of generated DB types** (`packages/database`, `apps/web`) can drift if regenerated by hand. `pnpm db:types` writes both; verified identical today. | Low | Keep regeneration only via the script; optionally add a CI equality check. |
| 10 | **Next.js 16 unfamiliarity.** Breaking changes vs common knowledge (see `apps/web/AGENTS.md`); naive edits may target removed APIs. | Low | Read `node_modules/next/dist/docs/` before web work. |
| 11 | **Single human account / bus factor**, and leaked-password protection off. | Low | Enable the toggle; invite a second org member when one exists. |

## 9. Recommended next steps

Mapped to the brief's phases. Phases 1–3 are, verifiably, already satisfied —
the work starts at phase 4/5, and the single most valuable sequence costs $0
plus one $19/mo decision.

**Phase 1 — audit: complete.** This document; companion docs verified.

**Phase 2 — architecture documentation: exists; keep it current.**
`CLAUDE.md`, `README.md`, `DEPLOYMENT.md`, `CURRENT_STATE.md` and the research
docs already constitute the architecture record. Only additions needed:
`.env.example` (now writable from a normal environment) and this audit.

**Phase 3 — database migrations: exist and applied.** No structural work
needed for the brief's model. Future *additive* migrations, in order of
likelihood: minors safeguards (age gate support, read-audit table), injury
`days_missed`/availability view, RLS predicate consolidation (risk #7),
`vector` extension when the AI phase starts.

**Phase 4 — ingestion architecture: exists; make it run and keep running.**
1. **Prove the write path staged**: PITR/backup point → `pnpm data:import
   --max-players 2000` → `pnpm quality:check` → `pnpm ingest:status`. This
   single step converts 30 sample players into a real dataset and finally
   populates `ingestion_runs` (and `transfers`, obsoleting the unapplied seed).
2. **Migrate Reep v0 → v1** (new namespace, re-resolve, keep v0 rows for
   provenance). Then `pnpm reep:resolve` gives most active players 5–10
   provider identities — the brief's identity pyramid, in data.
3. **Prove one player end-to-end** across providers on `/players/[id]`.
4. **Add the integration test** the defect log demands: importer vs a scratch
   database (Supabase CLI local stack or `pgtap`), wired into CI.
5. **Schedule the weekly refresh with GitHub Actions** (`data:update` +
   `quality:check` on cron, secrets in repo settings). This executes the
   `ingestion_jobs` specification without touching hosting; the job rows
   become the ledger they were designed to be.
6. **CI on every push/PR**: the five gates. Adopt PRs for anything
   non-trivial from here on.

**Phase 5 — player database foundation = phase 4 done at full scale.** Full
import (~50k players, 22,292 active), then decide the enrichment tier:
API-Football Pro at $19/mo fills `player_season_stats`, `matches`,
`player_injuries` for ~13k resolvable active players (~2 days of quota);
request the Wyscout quote (advanced metrics) and BeSoccer trial
(storage-rights question in the same email) in parallel.

**Phase 6 — analytics layer.** Only after real season stats exist: per-90
normalisation → position peer groups → percentiles into `player_percentiles`
(per provider, per peer group — never blended across providers) → rankings.
The StatsBomb-corpus methodology plan is now **doubtful rather than pending**:
the decoded agreement (§5 #5) bars commercial exploitation of the data *and
any analysis derived from it*, so use it only if counsel clears it —
otherwise develop the age-adjustment methodology on GBM's own licensed data.
Comparison UI once percentiles exist. No heatmaps until a licensed
event-location feed exists — the schema's honesty rule extends to the charts.

**Phase 7 — scouting workflow.** Write UIs over the existing tables
(reports, ratings, watchlist management, assignment); then `player_events` +
`alerts` producers (change detection is already specified as a job).

**AI preparation (brief's stated goal), when phases 5–6 are real:** install
`vector`; embed player statistical profiles (per season, per position peer
group) for "players similar to X"; the undervaluation query is then
`market_values` × percentile deltas; comparison and league-fit queries read
the same feature base. All of it stays inside Supabase, on GBM's own data, as
the brief requires.

**Immediate one-click hygiene:** enable leaked-password protection.

---

## 10. Method appendix — what was actually checked

- **Repository**: full tree walk (fresh clone, commit `050f036`); all 6
  commits and stats read; both branches enumerated; PR list queried via the
  GitHub API (empty); absence of `.github/` confirmed; all five docs read in
  full; migrations, provider contract + adapters, the ingestion service, auth
  middleware, and quality checks read at source level.
- **Build**: `pnpm install && pnpm typecheck && pnpm lint && pnpm test &&
  pnpm build` executed in this session; exit 0; outputs recorded in §2.3.
- **Supabase** (project `tyzndcjuiffnyhluddce`, management API + SQL):
  project health/version; all 48 tables enumerated with RLS flags; exact
  `count(*)` per table; unique constraints from `pg_constraint`; all views'
  `reloptions`; all function ACLs from `pg_proc`; all 61 policies from
  `pg_policies`; migration ledger; extension inventory; security + performance
  advisors; auth user count; storage buckets; database branches; edge
  functions; content of `data_providers`, `provider_fact_priority`,
  `entity_resolution_rules`, `ingestion_jobs`, `discovery_signals` grouped by
  type/currency/model.
- **External sources**: the nine-source research in
  `DATA_SOURCE_RESEARCH.md` re-read in full and cross-checked against the
  adapter code and seeded provider registry; all eight sources named in the
  brief re-verified against the live web on 2026-08-20 — GitHub repos,
  release manifests and the live `openapi.json` fetched directly, the
  StatsBomb `LICENSE.pdf` decoded, Kaggle-only facts marked UNVERIFIED where
  its JS shell blocked reading. Findings, including two corrections to the
  earlier research, are in §5.

Nothing was deleted, no schema or data was modified, no deployment occurred,
and no hosting configuration was touched at any point in this audit.
