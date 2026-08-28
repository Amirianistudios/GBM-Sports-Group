# Merge recovery

How GBM recovers the players damaged by the defective `gbm_merge_player`, what
"recovered" honestly means, and where recovery ends. Written 2026-08-28,
alongside migration 0048 and the `recovery:merged-players` command; outcome of
the first pass recorded the same day.

## Outcome of the first pass (2026-08-28, run `merge_recovery` #1)

**36 RECOVERED · 10 MANUAL_REVIEW · 0 PARTIAL · 0 NO_SOURCE_AVAILABLE — and
the per-player before/after deltas were zero everywhere.** The run scanned
2,725,862 dataset rows, re-sent every row the source holds for the 37 anchored
survivors (173 valuations, 116 transfers, 72 season-stat cells, 34 contracts),
and every one of them already existed under its natural key. No survivor
gained a single row.

That is not a failed recovery; it is the measurement the missing audit never
allowed. It tells us what the defect actually destroyed:

- The old function deleted a duplicate's row **only on a unique-key
  collision** — that is, only when the survivor already held a row with the
  same natural key. Rows with non-colliding keys were repointed and survived.
  So the *unique facts* survived the 46 merges; what was destroyed was the
  duplicate's **copy** of facts the survivor already had.
- Whether any of those copies carried *different values* (a conflicting
  valuation for the same date, a differently-priced transfer) is permanently
  unknowable — the old function kept no audit. This is exactly the class of
  information the platform does not pretend to have; the fixed
  `gbm_merge_player` archives such rows into `player_merge_conflicts`
  precisely so this question never becomes unanswerable again.
- The depletion fingerprint (survivors averaging 6.6 market values against a
  population 14.7) is now explained mostly by cohort, not loss: the dataset
  itself holds only ~4.7 valuations per anchored survivor — these are young
  regional players below the population's history depth. The population-mean
  flag aimed the pass correctly and then stopped being the measure, as
  designed.

The 10 MANUAL_REVIEW players are the real remainder: nine hold no
Transfermarkt identity at all (Avengers/Grok collection; their raw payloads
sit in `source_records` for a human to re-process) and one — Oybek
Urmonjonov, tm `1109178` — is anchored but absent from the dataset release
entirely.

## What happened

The original `gbm_merge_player` (captured verbatim in migration 0043) resolved
any unique-key collision during a merge by bulk-deleting the duplicate's rows.
It ran **46 times** before migration 0045 replaced it with the
archive-not-delete implementation. It kept no audit, so the destroyed rows
cannot be listed — only inferred. The cohort fingerprint of the 46 survivors
against the 7,790 other Transfermarkt-backed players localises the loss:

|                  | survivors | others | exposed to the delete? |
|------------------|----------:|-------:|---|
| market values    | 6.6       | 14.7   | yes — unique on (player, provider, date) |
| transfers        | 3.8       | 6.5    | yes — unique on (player, provider, date, clubs) |
| season stats     | 3.3       | 4.4    | yes — natural key contains player |
| contracts        | 1.7       | 0.8    | no — and they gained |
| representation   | 1.5       | 1.0    | no — and they gained |

Every collision-prone table is down; every safe table is up. That is the
defect's signature, and it is the closest thing to a loss measurement that
exists after the fact.

## What recovery is — and is not

Recovery is **targeted re-ingestion, not repair**. The
`recovery:merged-players` command re-imports, from the published Transfermarkt
dataset, every row the source still holds for each survivor, through exactly
the same natural-key upserts the weekly import uses. Nothing is patched by
hand, nothing is imputed, and no player row is ever created.

What it cannot do: the dataset publishes a **current snapshot** of
Transfermarkt. A row the old function destroyed that Transfermarkt itself no
longer carries — a valuation later revised away, a transfer for a player the
site delisted — is gone. For that reason the success state is called
**source-complete**, never history-complete, and nothing in the platform
claims historical completeness for these 46 players.

## The states

Every run writes one row per survivor into `merge_recovery_attempts`
(before-coverage, after-coverage, what the source held). The queue view
`v_merge_recovery_queue` — which nothing deletes — shows each player's latest
state:

| state | meaning |
|---|---|
| `PENDING` | no recovery attempt yet |
| `RECOVERED` | source-complete: GBM holds at least as many market values and transfers as the dataset carries for this id |
| `PARTIAL` | the import added rows but the source still holds more — something blocked a row; ask why before re-running |
| `NO_SOURCE_AVAILABLE` | no Transfermarkt id and no raw payloads; there is nothing for any automated path to re-read |
| `MANUAL_REVIEW` | automation ends: the player has only raw payloads in `source_records` (a human can re-process them), or the dataset does not know their id |

Classification lives in `classifyRecovery()`
(`services/ingestion/src/transfermarkt/recovery.ts`), is pure, and its truth
table is pinned by `recovery.test.ts`. The comparison uses market values and
transfers because that is where the defect measurably bit; season statistics
are aggregates, so a row-level source comparison would not be meaningful.

`likely_lost_rows` remains in the view as the original aiming heuristic
(below the population means of 14 market values / 6 transfers). It is **not**
the success criterion: a 19-year-old with three genuine Transfermarkt
valuations will never reach the population mean, and calling that player
unrecovered forever would be the same class of dishonesty as reading
`NO_AGENCY_LISTED` as "unrepresented".

## The cohort, before the first run

Measured live on 2026-08-28, before the first run:

- 46 survivors in the queue; 39 flagged `likely_lost_rows`.
- **37 hold a Transfermarkt id** and are recoverable from the dataset. Five of
  them hold it only under the `TRANSFERMARKT_DATASET` provider code — the
  0047 view missed those; 0048 checks both codes.
- **9 hold no Transfermarkt identity at all.** They came through the
  Avengers/Grok collection path (Dutch amateur and Uzbek players, mostly) and
  have only raw payloads in `source_records`. The dataset cannot help them;
  they classify as `MANUAL_REVIEW` (payloads exist) or `NO_SOURCE_AVAILABLE`.

## Running it

    pnpm recovery:merged-players

or the `merge-recovery` workflow (push a change to `.github/recovery-trigger`,
or dispatch it by hand). The workflow holds the service-role key; there is no
local path to production writes.

Each run:

1. reads the queue and captures every survivor's current coverage,
2. downloads/revalidates the dataset (~230 MB, skipped when current),
3. measures what the source holds per player, with the importer's own row
   filters, so RECOVERED/PARTIAL is a comparison rather than a guess,
4. re-imports contracts, representation, valuations, transfers and season
   stats with a player map restricted to the survivors,
5. re-reads the queue and writes one `merge_recovery_attempts` row per player,
6. records everything in an `ingestion_runs` row with `job_key =
   'merge_recovery'` (players attempted/recoverable, per-state counts, and a
   per-player delta table in the run summary).

Idempotent by construction: every write path is a natural-key upsert, so a
re-run against an unchanged dataset updates nothing and duplicates nothing.

## How the platform watches it

- `gbm_data_quality_report()` counts `merge_survivors_needing_reingest`
  (states PENDING or PARTIAL — the automatable remainder) and
  `merge_recovery_manual_review` (the part that needs a person) separately.
- `/data/quality` renders the queue with per-player states and the two counts
  as graded checks.
- The run ledger keeps every attempt; `merge_recovery_attempts.run_id`
  survives run pruning (`on delete set null`).

## Related

- [`DATA_QUALITY.md`](DATA_QUALITY.md) — the checks around this queue.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — verified counts, updated per run.
- Migration `20260901150000` — the merge function that stopped the bleeding.
- Migration `20260902120000` — the attempt audit and state machine.
