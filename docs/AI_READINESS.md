# AI readiness

**Written 2026-08-20.** What the platform already provides for AI-assisted
scouting, what is deliberately not built yet, and the guardrails any future
assistant must inherit. The rule above all: **the AI answers from GBM's own
database, states its cohort, and never invents a number.**

## What the target queries need, and what already exists

| Target query | Needs | Status |
|---|---|---|
| "Find U21 centre-backs similar to X" | A per-player feature vector + nearest-neighbour search | Features exist (`v_player_discovery`: age, position, per-90s, minutes, value, signals); vector search **not yet** — `pgvector` is available on the project but uninstalled |
| "Which young defenders are undervalued?" | Performance percentile vs value percentile inside a position cohort | Computable today in SQL from `v_player_discovery` (the comparison page already computes position-cohort percentiles); an "undervalued" ranking is performance-percentile − value-percentile, cohort-labelled |
| "Compare these three midfielders" | Side-by-side per-90s + percentiles | **Built** — `/compare` |
| "Which players fit a Belgian first division team?" | League dimension + filters | League filtering exists (`league_name` in the discovery view); "fit" beyond filters needs the licensed advanced metrics |

## The honest foundation (already in place)

1. **One queryable surface per player** — `v_player_discovery` joins identity,
   value, representation, current-season counting statistics and per-90s into
   one row. This is the feature table an embedding job reads.
2. **Cohort discipline** — per-90s are NULL under 270 minutes; percentiles are
   computed within position cohorts of the imported population and labelled as
   such. Any AI answer inherits both rules.
3. **Provenance** — every fact traces to a provider; an assistant can (and
   must) cite which source stands behind a claim.
4. **Identity graph** — 99.8% of players resolve across up to 9 providers, so
   an AI answer can link out rather than guess.

## Deliberately not built yet, and why

- **Embeddings/pgvector**: installing the extension is one migration, but an
  embedding of counting statistics alone would make "similar players" mean
  "similar goal counts" — misleading for defenders and keepers. Similarity
  becomes honest when the licensed advanced metrics (duels, progressive
  actions, xG) arrive; build it then, not before.
- **A natural-language layer**: pointless until the data it would narrate
  covers the populations GBM actually scouts (see the age-skew and league
  coverage findings in `STAGED_DATA_VALIDATION.md`).

## Guardrails for any future assistant

1. Answers come from GBM's database only; no outside "knowledge" about
   players may be blended in silently.
2. Every ranked answer states its cohort ("among imported players with 270+
   minutes at CB") — the comparison page sets the pattern.
3. `NO_AGENCY_LISTED` keeps its caveat in AI output, verbatim in spirit.
4. Under-18 processing follows `YOUTH_AND_MINORS.md` — no AI surface may
   rank or queue minors outside those rules.
5. Missing data is reported as missing. An assistant that fills gaps is a
   defect, not a feature.
