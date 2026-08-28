# The talent engine

Phase B2's position intelligence: what the numbers are, what each one is
allowed to mean, and the order everything computes in. Shipped 2026-08-28 in
migrations 0051–0053; first verified against live data the same day.

## Four numbers, four names, never blended

| Number | Model | Answers | Lives in |
|---|---|---|---|
| Metric percentile | `POSITION_PERCENTILE_V1` | how does this output compare with true peers | `player_percentiles`, one row per metric |
| Performance score | `GBM_PERFORMANCE_V1` | one 0–100 summary of those percentiles, weighted per family | `player_percentiles`, `metric_key = 'PERFORMANCE_SCORE'` |
| Role fit | `GBM_ROLE_FIT_V1` | how well does the output match a specific job (FINISHER, CREATOR) | `player_percentiles`, `metric_key = 'ROLE_FIT:*'` |
| Development trend | `GBM_DEVELOPMENT_V1` | which way is the player moving season over season | `discovery_signals`, `signal_type = 'DEVELOPMENT_TREND'` |

The GBM opportunity score (agency fit: age, markets, value, contract) and the
competition strength rating remain their own numbers. **Nothing multiplies
them together.** Competition strength enters the percentile system only as a
cohort *band* — a striker in a TOP league is ranked among TOP-league
strikers, and the band is printed next to the rank. There is deliberately no
single unexplained number mixing performance, fit, opportunity and level.

## Versioning

Every row carries `model_version`. A formula change is a new version
computed alongside the old, never a silent overwrite — exactly how this
engine itself arrived: the retired `claude_compute_percentiles` rows
(`peer_group like 'CLAUDE:%'`, 33,670 rows) are still in the table,
untouched, as the before-picture. `talent-engine.test.ts` pins the old
methodology as *failing* the new cohort rules (four-bucket positions,
8-player cohorts, 300-minute floor, self-deleting runs), so nobody can
quietly regress to it.

## Pipeline order

    INGESTION → NORMALIZATION → RESOLUTION → CACHE → COHORTS →
    PERCENTILES → PERFORMANCE → ROLE FIT → DEVELOPMENT → SIGNALS → DASHBOARD

Concretely, per week: `data-refresh` (Wed) → `reep-enrich` (Thu) →
`talent-recompute` (Fri 05:00 UTC), which runs `gbm_compute_percentiles` →
`gbm_compute_performance_score` → `gbm_compute_role_fit` →
`gbm_compute_development`, each stage's report recorded in the
`talent_recompute` ingestion run. On demand: `pnpm talent:recompute`, or
touch `.github/talent-trigger`.

## First live run (2026-08-28)

- 43,286 percentile rows over 2,860 players and nine metrics; 19,190 HIGH /
  24,096 MEDIUM confidence; cohorts 28,833 MID-band, 9,598 TOP, 492 LOW,
  178 UNRATED, 4,185 band-fallback (ALL).
- 9,282 performance scores; 2,292 players.
- Role fit for FINISHER and CREATOR across the attacking families.
- 3,001 development signals: 499 RISING, 830 STABLE, 468 DECLINING,
  5 BREAKTHROUGH, 1,199 INSUFFICIENT_HISTORY.
- Face check: Kylian Mbappé, STRIKER 2025/2026 — 1.07 goals/90 (98.4th
  percentile of 64), 1.27 contributions/90 (100th), performance 92.8 HIGH.

## The 0051→0052 lesson, kept on the record

0051's engines stamped rows with `now()` (transaction start) and swept
"stale" rows older than a `clock_timestamp()` taken later — so a run deleted
its own output, and 0051's guard missed it by asserting on the INSERT count
rather than on what survived. 0052 fixed both, and every engine's guard now
asserts on **surviving** rows. The failure and the fix are both in the
migration chain because that is where the platform keeps its mistakes.

## Related

- [`PERCENTILES.md`](PERCENTILES.md) — cohorts, floors, fallback, confidence.
- [`METRIC_CATALOG.md`](METRIC_CATALOG.md) — the nine metrics and their sources.
- [`ROLE_PROFILES.md`](ROLE_PROFILES.md) — why exactly two roles.
- [`DATA_QUALITY.md`](DATA_QUALITY.md) — the statistical checks watching all of it.
