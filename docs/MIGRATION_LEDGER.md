# The migration ledger

Verified 2026-08-28 against project `tyzndcjuiffnyhluddce`.

|  |  |
|---|---:|
| migration files in `supabase/migrations/` | **44** |
| rows in `supabase_migrations.schema_migrations` | **66** |
| distinct names in that ledger | **65** |
| applied names with no matching repo filename | **25** |
| repo filenames with no matching ledger row | **3** |
| **live objects with no representation in the repo** | **0** |

The last row is the one that matters, and it is the one that was broken. Every
table, view and function that exists in production is now created by some file
in `supabase/migrations/`. What remains is a **bookkeeping** mismatch: the same
objects are recorded under different names on the two sides.

## Why the two lists differ

Three separate causes, and they need different treatment.

**1. Applied out-of-band, under a working name.** A parallel session built the
SofaScore/Transfermarkt ingestion directly against production through
`apply_migration`, which records whatever name the caller passes. Those names
describe the step (`sofascore_ingest_fn_v4`) rather than a repo file, and four
of them are successive revisions of one function. The repo represents the end
state of all of them in a single capture migration.

**2. Renamed on the way into the repository.** Two early migrations were
applied under one name and committed under another.

**3. Deliberately never applied.** `capture_the_out_of_band_objects` exists to
make the repository able to rebuild production. Running it against production
would be re-creating objects that are already there.

## The mapping

Every legacy ledger name, and the repo file that now holds the same objects.

| Ledger name (applied) | Repo file that represents it | Objects |
|---|---|---|
| `create_staging_ingest` | `20260901130000_capture_the_out_of_band_objects` | `staging_ingest` |
| `sofascore_ingest_pipeline` | same capture | `sofascore_tournaments` |
| `sofascore_ingest_fn_v2` | same capture | `ingest_sofascore_batch` (superseded) |
| `sofascore_ingest_fn_v3` | same capture | `ingest_sofascore_batch` (superseded) |
| `sofascore_ingest_fn_v4` | same capture | `ingest_sofascore_batch` (superseded) |
| `sofascore_ingest_fn_v5` | same capture | `ingest_sofascore_batch` (final) |
| `club_merge_and_fuzzy_match` | same capture | `gbm_find_club`, `gbm_merge_club`, `gbm_norm` |
| `gbm_merge_player_fn` | capture, then `20260901150000_a_merge_must_not_destroy_the_duplicate` | `gbm_merge_player` |
| `v_claude_candidates` | same capture | `v_claude_candidates` |
| `claude_tm_queue_rpc` | same capture | `claude_tm_queue` |
| `claude_write_reports_fn` | same capture | `claude_write_reports` |
| `claude_percentiles_fn_v3` | same capture | `claude_compute_percentiles` |
| `ingest_tm_agent_batch` | same capture | `ingest_tm_agent_batch` |
| `ingest_tm_profile_batch` | same capture | `ingest_tm_profile_batch` |
| `intel_reports_allow_agentless_author` | same capture | `intel_reports.author_code` path |
| `intel_ops_board` | same capture | `intel_ops_board` |
| `club_recruitment_v1` | same capture | `club_recruitment_profiles`, `recruitment_matches`, `gbm_match_profile` |
| `recruitment_matches_select_only` | same capture | RLS policy on `recruitment_matches` |
| `idempotency_constraints` | `20260819124000_natural_key_constraints` | natural keys — **renamed** |
| `lock_down_ingestion_functions` | `20260819130200_harden_views_and_functions` | function grants — **renamed** |
| `views_security_invoker` | `20260819130200_harden_views_and_functions` | `security_invoker` on views — **renamed** |
| `intelligence_views` | `20260819125000_analytical_views` | `v_player_source_coverage` and siblings |
| `analytical_views` *(also in repo)* | `20260819125000_analytical_views` | matched already |
| `discovery_signals_growth_scale` | `20260819130100_discovery_signals` + `20260823100000_gbm_opportunity_model` | signal scaling |
| `representation_view_identity_columns` | `20260819125000_analytical_views` + `20260820150000_discovery_view_and_links` | `v_player_representation` columns |
| `gbm_role_values` | `20260819120300_gbm_workspace` + `20260824100000_gbm_portfolio_and_intelligence` | `gbm_role` enum values |

And the three repo files with no ledger row:

| Repo file | Status |
|---|---|
| `natural_key_constraints` | applied as `idempotency_constraints` |
| `harden_views_and_functions` | applied as `views_security_invoker` + `lock_down_ingestion_functions` |
| `capture_the_out_of_band_objects` | **deliberately never applied** — see below |

`league_strength_from_squad_value` appears **twice** in the ledger (66 rows,
65 names): the first run produced a flawed ladder and the corrected function
was applied under the same name. Only the corrected definition is live.

## What this costs today

`supabase db push` compares the ledger against local filenames. It would treat
all 44 repo files as unapplied and try to replay them. Most are idempotent
(`create or replace`, `create table if not exists`) but several are not — the
early `create type` statements would fail, and the capture would attempt to
recreate live objects. **Do not run `supabase db push` against production until
the ledger is reconciled.**

Nothing else is affected. The application never reads the ledger; it is used
only by the CLI.

## How to reconcile it — the safe order

The CLI's `migration repair` writes the ledger *without executing SQL*, which
is exactly the tool for this. It is also a loaded gun: marking a migration
applied when its objects do not exist means that DDL never runs and the gap is
invisible until something reads the missing object.

So the rebuild proof comes first.

1. **Prove the chain on a preview branch.** `supabase branches create`, apply
   `supabase/migrations/` from empty, and compare the resulting schema with
   production. Until that passes, a repair is a guess. Recorded in
   [`SCHEMA_REBUILD_VERIFICATION.md`](SCHEMA_REBUILD_VERIFICATION.md).

   **This step has not been done.** The branch was costed and declined on
   2026-08-28, so the reconciliation below is blocked by choice rather than by
   difficulty. Do not skip ahead to step 3: `migration repair` writes the
   ledger without running SQL, so marking a file applied on an unproven chain
   can hide a migration that never worked, permanently and silently. The
   ledger mismatch is untidy; a falsely-repaired ledger is dangerous.

2. **Link and read the current state.**

   ```bash
   supabase link --project-ref tyzndcjuiffnyhluddce
   supabase migration list        # Local | Remote, side by side
   ```

3. **Mark every repo migration as already applied**, because the objects are
   already in production and the preview branch has shown the chain produces
   them:

   ```bash
   supabase migration repair --status applied <version>   # per repo version
   ```

4. **Retire the 25 legacy names** so the ledger stops describing steps no file
   corresponds to:

   ```bash
   supabase migration repair --status reverted <version>  # per legacy version
   ```

   This only removes the bookkeeping row. It executes nothing and drops
   nothing.

5. **Confirm**: `supabase migration list` should show every local file with a
   matching remote entry and no unmatched remote rows. `supabase db push`
   should then report nothing to do.

Steps 3 and 4 need the Supabase CLI authenticated with a personal access token
(`SUPABASE_ACCESS_TOKEN`), which the automation environment does not hold.
They are a deliberate operator action, not something to run unattended.

## What must not happen

- **Do not `supabase db push` before the repair.** It replays 44 files against
  a database that already has them.
- **Do not repair the capture migration to `reverted`.** Its objects are live;
  the row must read applied so nothing tries to create them again.
- **Do not delete rows from `supabase_migrations.schema_migrations` by hand.**
  `migration repair` exists for this and keeps the table's own invariants.
