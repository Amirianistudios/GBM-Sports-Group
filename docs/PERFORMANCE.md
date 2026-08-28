# Performance

What was measured, what was changed, and what the numbers are now. Measured
2026-08-28 on production data (13,296 players); the audit that produced this
list is [`UX_PERFORMANCE_AUDIT.md`](UX_PERFORMANCE_AUDIT.md). Follow-up
measurements ran after migrations 0049/0050 and the query changes shipped with
them.

## The advisor findings — before → after

| Finding | Before | After |
|---|---|---|
| Duplicate index on `discovery_signals` | two byte-identical `(signal_type, score DESC) WHERE is_current` indexes, both maintained on every write | one (`_current_type_idx`); `_type_score_idx` dropped in 0049 |
| Multiple permissive SELECT policies on `player_links` | `player_links_select` + `player_links_write (FOR ALL)` — two policies evaluated per read | one policy per action (select / insert / update / delete), identical access surface, guard-verified |
| Unindexed foreign keys | 76 INFOs | 72 — four added **with a named consumer each** (`player_season_stats(competition_id)` for league strength + B2 cohorts; `alerts/recruitment_matches/player_rankings(player_id)` — the last unindexed children of `players.id`, probed by every merge and every player delete). The other 72 are cold paths, deliberately left. |
| Unused indexes | 31 INFOs | untouched by design — six days of usage statistics are not evidence; revisit with months of history |
| **Advisor WARN/ERROR count** | **2 WARN** | **0** |

## The row-cap corrections (correctness, not just speed)

Supabase returns at most 1,000 rows per unranged request. Three surfaces were
silently computing on truncated data:

| Surface | Before | After |
|---|---|---|
| `/trends` | whole `players` table into JS → medians over ≤1,000 rows, truncated count printed as "the N tracked players" | `gbm_trends_report()` aggregates in SQL over all 13,296 (9,496 valued); the page now states both numbers, measured < 50 ms server-side |
| `/data` | whole `player_external_ids` (85,100 rows) read to infer provider presence from ≤1,000 — providers whose ids sorted late looked disconnected | `v_provider_id_counts` (GROUP BY in the database), joined into the same parallel batch; per-provider player counts now shown |
| Dashboard alerts stat | length of the 3-row preview list — could never exceed 3 | real unread count from `gbm_dashboard_summary()` |

## Query consolidation — measured

| Query | Before | After |
|---|---|---|
| Dashboard stat row | 4 count round-trips | 1 RPC (`gbm_dashboard_summary`), < 1 ms server-side; page now runs 7 parallel queries instead of 9 |
| `/recruitment/[id]` | 3 **serial** queries (requirement → candidates → 2,000-row facet scan) | requirement, then candidates ∥ facets — one full round-trip removed from the app's slowest route |
| Profile history reads | 9 unbounded per-player queries | bounded (`market_values` newest-300 re-sorted for the chart, `transfers` 100, `injuries`/`reports` 50) — the payload is now stated, not accidental |

## What was measured and deliberately NOT changed

- **`v_player_discovery` sorted: 4,576 ms** (10 correlated subqueries ×
  13,296 rows before any sort). The fast cached-column path answers the same
  intents in 2.7 ms, and the pages already prefer it; the view path remains
  only for representation/per-90 filters. Rebuilding this properly is Phase
  B2's CACHE + PERCENTILES work — patching the view now would be churn ahead
  of its replacement.
- **Search**: `idx_players_full_name_trgm` already carries `ilike '%term%'`
  at 5.8 ms. No work needed; the global search (`/`, Cmd/Ctrl+K) rides it.
- **`/compare` cohort percentiles** clamp at the row cap; B2's percentile
  engine replaces this arithmetic wholesale, so it is documented rather than
  half-fixed twice.
- **`force-dynamic` everywhere**: correct for an auth-gated app whose pages
  are personalised by RLS; the fix for perceived latency is the loading
  states added in this pass (9 routes had none), not caching pages that must
  not be cached.

## How to re-measure

```sql
explain (analyze, buffers) select * from v_player_discovery
  order by market_value desc nulls last limit 30;   -- the known-slow path
select gbm_trends_report();                          -- whole-population trends
select gbm_dashboard_summary();                      -- the stat row
```

and the Supabase performance advisor, which must stay at 0 WARN/ERROR — the
remaining INFOs are inventoried above with the reason each is left alone.
