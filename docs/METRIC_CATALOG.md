# Metric catalog

The metrics the percentile engine may rank — and the table (`metric_catalog`)
is the authority the engine reads, so adding one is a reviewed migration
insert, not a code edit. Nothing here is derived, imputed or estimated: a
metric whose inputs the sources do not carry is not in the catalog.

## The nine

| Metric | Kind | Direction | Families | Source of the inputs |
|---|---|---|---|---|
| `goals_per90` | counting | high | outfield | TM dataset (SOFASCORE fallback) |
| `assists_per90` | counting | high | outfield | TM dataset (SOFASCORE fallback) |
| `goal_contributions_per90` | counting | high | outfield | TM dataset (SOFASCORE fallback) |
| `discipline_per90` | counting | **low** | all | TM dataset (SOFASCORE fallback); yellows + 2×reds |
| `shots_per90` | extended | high | AM, WINGER, STRIKER | SOFASCORE only |
| `key_passes_per90` | extended | high | FB_WB → STRIKER | SOFASCORE only |
| `xg_per90` | extended | high | AM, WINGER, STRIKER | SOFASCORE only (sparse; cohorts often fail the floor — correctly) |
| `pass_accuracy_pct` | ratio | high | all | SOFASCORE only; requires ≥200 attempted passes |
| `saves_per90` | extended | high | GK | SOFASCORE only |

Families gate meaning: a goalkeeper never carries a shots percentile, a
striker never a saves one — enforced by the engine's join and asserted by
its guard.

## Coverage, measured 2026-08-28

- Counting inputs: 34,178 TM-dataset season rows (3,417 players, seasons
  2014→2026) + 6,141 SOFASCORE rows (5,664 players, 2025/26-era).
- Extended inputs: ~4,272 SOFASCORE rows carry shots/key passes/saves/pass
  volumes; xG on 956.
- Result: countings rank across ~10 seasons; extended metrics rank mostly in
  the current seasons — and thin cohorts are dropped, not padded.

## What is deliberately absent

Duels, interceptions/tackles (1,175 rows — below any honest cohort),
progressive passes/carries, touches in box, aerials: the columns exist in
the schema for the day a licensed event-data provider fills them, and they
stay out of the catalog until then. The profile's own footer says the same
thing to scouts.

## Adding a metric

1. Confirm the inputs genuinely exist at cohort scale (count them; do not
   assume).
2. `insert into metric_catalog …` in a new migration, with families chosen
   by football meaning and a description that says what the number cannot
   tell you.
3. If the metric should influence a summary, add its weight to a **new**
   performance/role model version — never edit V1's weights in place.
