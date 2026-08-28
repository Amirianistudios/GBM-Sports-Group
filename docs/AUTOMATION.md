# Automation

Every scheduled job GBM runs, what it touches, and how to tell whether it
worked. Verified 2026-08-28.

## Where jobs run, and why not Vercel

GitHub Actions, not Vercel Cron. Vercel deployments are built from `main` and
have no service-role key — deliberately, so a compromised frontend cannot
bypass RLS. The service key lives in GitHub secrets, so anything that writes
past RLS runs on a runner.

    LOCAL → GITHUB MAIN → CI → VERCEL        (application)
    GITHUB ACTIONS → SUPABASE                (data)

## The jobs

| Workflow | Schedule | Does | Writes |
|---|---|---|---|
| `ci` | every push and PR | install, typecheck, lint, test, build | nothing |
| `hourly-intelligence-refresh` | `10 * * * *` | refreshes tracked players | news, live status, injuries |
| `data-refresh` | `0 3 * * 3` | Transfermarkt dataset import, capped at 2,000 in GBM priority order | players, stats, values, transfers, contracts |
| `reep-enrich` | `0 5 * * 4` | resolves identities against the Reep register | `player_external_ids` |
| `data-import-trigger` | marker file on `main` | staged import by hand | as `data-refresh` |
| `merge-recovery` | marker file / dispatch — deliberately unscheduled | targeted re-ingestion for the merge survivors | same tables, restricted to the queue's players; one `merge_recovery_attempts` row per survivor |

All the data workflows share `concurrency: gbm-ingestion`, so they queue
rather than overlap. They write the same tables and the caches derived from
them; two at once would interleave.

### reep-enrich, added 2026-08-28

Thursday 05:00 UTC, the morning after the Wednesday dataset import, so players
that arrived in that import get their provider ids without waiting a week.

It downloads the ~97MB CC0 Reep release and scans 5.87M bridges, which is why
it is a runner job and not a serverless function. Idempotent: ids already held
are skipped, so a re-run against an unchanged release writes nothing.

Runs `ingest:preflight` first — a missing service key fails in seconds rather
than after the register has been downloaded and scanned — and `quality:check`
afterwards, because new provider ids change which players have coverage.

### merge-recovery, added 2026-08-28

Unscheduled on purpose: recovery is a bounded operation over a known cohort
(the 46 players in `v_merge_recovery_queue`), not a feed. Each run re-imports
everything the Transfermarkt dataset holds for the anchored survivors through
the standard natural-key upserts and writes one `merge_recovery_attempts` row
per player with before/after coverage. Re-running is safe but should be a
decision — a PARTIAL outcome means something blocked a row and repetition
alone will not unblock it. Run #1 (2026-08-28): 46 attempted, 36 RECOVERED,
10 MANUAL_REVIEW, zero rows gained — the details are in
[`MERGE_RECOVERY.md`](MERGE_RECOVERY.md).

## Starting a run by hand

The GitHub App that opens pull requests here cannot call `workflow_dispatch`,
so each data workflow also watches a marker file:

    .github/reep-trigger            → reep-enrich
    .github/intelligence-trigger    → hourly-intelligence-refresh
    .github/import-trigger          → data-import-trigger
    .github/recovery-trigger        → merge-recovery

Touching one on `main` starts that workflow. `workflow_dispatch` also works for
anyone whose token carries `actions:write`.

## Knowing whether it worked

Every job opens a row in `ingestion_runs` **before** it works and closes it
even when it throws. A job that died halfway leaves a row saying so; a job that
never ran shows an honest absence rather than a comforting blank.

- **In the app**: `/data/sync` shows the latest run per job with its counts.
- **In SQL**: `select job_key, status, started_at, error_count from ingestion_runs order by started_at desc limit 20;`
- **In GitHub**: each workflow writes its tail to the run summary and uploads
  its logs as an artifact.

## Idempotency

Non-negotiable, because every one of these re-runs on a schedule:

- append-only tables carry natural keys with `NULLS NOT DISTINCT`, so a
  re-import updates rather than duplicates;
- the Reep resolver skips ids it already holds;
- `gbm_merge_player` replays a completed merge as its own report;
- `gbm_refresh_competition_strength` returns rows *changed*, so a settled
  database returns 0.

## Not yet automated

- **Percentile recomputation** — `claude_compute_percentiles` exists and is
  driven by hand.
- **Discovery signals** run only with the weekly import, not daily.
- **The daily intelligence digest** described in the Phase B brief.
- **Targeted re-ingestion of the merge recovery queue** — the weekly import is
  capped at 2,000 players in priority order and does not guarantee to include
  the 39 flagged players.

## Related

- [`DATA_QUALITY.md`](DATA_QUALITY.md)
- [`ENTITY_RESOLUTION.md`](ENTITY_RESOLUTION.md)
- [`CURRENT_STATE.md`](CURRENT_STATE.md)
