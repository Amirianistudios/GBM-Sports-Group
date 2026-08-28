# Role profiles

Model `GBM_ROLE_FIT_V1` (migration 0053). Two roles ship. That number is the
point of this document.

## The two

| Role | Families | Weights | Question it answers |
|---|---|---|---|
| **FINISHER** | AM, WINGER, STRIKER | goals/90 ×0.55 · shots/90 ×0.25 · xG/90 ×0.2 | does he put the ball in the net at rate |
| **CREATOR** | FB_WB, DM, CM, AM, WINGER, STRIKER | assists/90 ×0.5 · key passes/90 ×0.5 | does he make goals for others |

Both are weighted blends of `POSITION_PERCENTILE_V1` rows, so they inherit
every cohort guarantee (family, season, 450-minute floor, 30-player
cohorts), renormalise over the metrics the player actually has (minimum
two), and record their components on the row. Role fit is stored and
displayed separately from the performance score: an elite FINISHER can have
a middling season overall, and the interface must be able to say both.

## Why not eight

A role profile is only as honest as the metrics that define it. With the
current catalog:

- **BALL_WINNER / DEFENSIVE roles** would need duels, tackles,
  interceptions at cohort scale — tackles/interceptions exist on 1,175
  season rows, duels on none. A "ball-winner fit" built on discipline and
  pass accuracy would be a relabeled guess wearing a football word.
- **DEEP_PLAYMAKER vs BOX_TO_BOX** would need progressive passes/carries —
  columns the schema holds and no source fills.
- **SWEEPER_KEEPER** would need distribution and sweeping actions — GK data
  today is saves and pass accuracy.

The brief said *build fewer role profiles, correctly*. Two is fewer, and
they are correct. The next roles arrive with the licensed provider that
makes them computable, as a new model version.

## Reading it

Profile → Performance tab, as chips next to the performance score
("Finisher 84 · Creator 61"), each 0–100 within the player's own cohort
percentiles. SQL: `metric_key like 'ROLE_FIT:%'` in `player_percentiles`,
components in the `cohort` jsonb.
