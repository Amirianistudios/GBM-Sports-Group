# Percentiles

How a player's number becomes a rank, and the rules that keep the rank
honest. Model `POSITION_PERCENTILE_V1`, migrations 0051–0052.

## The cohort is the whole argument

A percentile is only as meaningful as the group it ranks within. The rules,
in the order they are applied:

1. **Family**: GK, CB, FB_WB, DM, CM, AM, WINGER, STRIKER — mapped by
   `gbm_cohort_family()` from the *specific* recorded position. Coarse
   labels ("Defender", "Midfielder", "Forward", "Missing") map to NULL and
   are excluded entirely: guessing CB-or-FB for 1,353 "Defender"s would
   poison every cohort they landed in. 8,443 of 13,296 players map today.
2. **Season**: cohorts never pool across seasons. `2025/2026` and calendar
   `2026` are distinct cohorts, as they are distinct football.
3. **Strength band**: TOP (rating ≥55), MID (35–55), LOW (<35), UNRATED —
   from the competition the player logged most minutes in. A band that
   cannot seat **30 players** falls back to the whole family-season
   (`ALL`); if even that is under 30, **nothing is written**. Band is
   context stored next to the rank; it is never multiplied into a score.
4. **Minutes floor: 450.** Below it a per-90 is an anecdote. 900+ minutes
   in a cohort of 60+ marks the row HIGH-confidence; every qualifying row
   is at least MEDIUM. There is no LOW percentile — below the floors the
   honest output is absence.

Every row records the cohort it used —
`{family, season, band, size, player_minutes}` — so a number on any screen
can always say who it compared against.

## Sources, without double counting

Counting inputs (goals, assists, cards, minutes) come from the Transfermarkt
dataset where it covers the player-season, SOFASCORE otherwise — chosen,
never summed across providers. Extended inputs (shots, key passes, xG,
saves, pass volumes) exist only where SOFASCORE recorded them, and their
per-90s divide by SOFASCORE's own minutes. The full list is
[`METRIC_CATALOG.md`](METRIC_CATALOG.md).

## Direction

`percent_rank()` orders HIGH-good metrics ascending-by-value (100 = best)
and LOW-good metrics (cards) inverted, so a 90th percentile always reads as
"good at this" on every surface. The performance score inverts LOW-good
components again before weighting for the same reason.

## What replaced what

The retired methodology (`claude_compute_percentiles`, captured in 0043,
33,670 rows kept in place under `CLAUDE:%` peer groups):

| | Old | New |
|---|---|---|
| positions | GK / DEF / MID / FWD | eight families |
| minimum cohort | 8 | 30, or nothing |
| minutes floor | 300 | 450 (900 for HIGH) |
| competition level | mixed into one group string | explicit band, with fallback recorded |
| versioning | none; every run deleted its predecessor | `model_version` on every row; a run replaces only its own version's stale rows |
| sources | SOFASCORE only | TM dataset + SOFASCORE, provider-chosen per fact |

`talent-engine.test.ts` holds regression tests in which the old
methodology's captured parameters **fail** the new rules — the brief's
requirement, kept executable.

## Reading it

- Profile → Performance tab → *Performance intelligence*: latest season's
  percentile bars, the performance score, role fit and the development
  badge, with the cohort named in the subtitle.
- SQL: `select * from player_percentiles where model_version =
  'POSITION_PERCENTILE_V1' and player_id = …`

## Recomputation

Weekly (`talent-recompute`, Fri 05:00 UTC) or `pnpm talent:recompute`.
Idempotent: natural-key upserts plus a same-version stale sweep;
`CLAUDE:%` rows are never touched. Watched by three statistical checks in
`gbm_data_quality_report()` — cohort-floor violations, out-of-range scores,
impossible minutes — all of which must stay at zero.
