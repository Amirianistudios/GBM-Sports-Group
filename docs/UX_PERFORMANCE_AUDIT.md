# UX + performance audit

Measured 2026-08-28 against release `9eadfbf` — the production build, served
locally against the live database, screenshotted at 390×844, 430×932, 768×1024
and 1440×900 with an authenticated scout-role session; queries measured with
`EXPLAIN (ANALYZE, BUFFERS)` on production data (13,296 players). Everything
here was observed, not assumed. The fixes shipped from this audit are recorded
in [`PERFORMANCE.md`](PERFORMANCE.md).

## The shape of the problem

The platform's data model and visual identity are strong. What the audit
found is a **consistency gap**: the best pattern in the codebase is never the
only pattern. One page paginates honestly while another prints a truncated
count as fact; one empty state offers an action while nine routes render a
frozen screen with no feedback at all; the most carefully-caveated sentence
in the product sits six tab-clicks deep while an uncaveated version of the
same claim ships on every list row.

## Query measurements (production data)

| Query | Path that runs it | Measured |
|---|---|---:|
| `players` by `cached_opportunity` (indexed), limit 6 | dashboard, discover | **2.7 ms** |
| `full_name ilike '%silva%'` via `idx_players_full_name_trgm` | players search | **5.8 ms** |
| `count(*)` on players | dashboard stats | **< 1 ms** |
| `v_gbm_portfolio` full read (15 rows) | portfolio, dashboard | **25 ms** |
| `v_player_discovery` limit 30, no sort | players (slow path) | **372 ms** |
| `v_player_discovery` sorted, limit 30 | players sorted by stats/signal | **4,576 ms** |

The last row is the finding: the discovery view runs ~10 correlated
subqueries per player, so any sort forces all 13,296 evaluations before the
first row returns. Every surface that stayed on indexed `cached_*` columns is
two to three orders of magnitude faster than the one that did not. Search is
already scalable — the trigram index exists and works; no `%term%` seq-scan
problem exists at this population.

**The silent row cap.** Supabase returns at most 1,000 rows per request
unless ranged. Three surfaces read "everything" and get 1,000: `/trends`
(whole `players` table into JS medians — **then prints the truncated count as
"the N tracked players"**), `/data` (whole `player_external_ids` table —
85,100 rows — for a per-provider count), and `/compare`'s per-position cohort
scans, whose percentile denominators quietly clamp. `/watchlists`' 3-level
unbounded embed joins the same club.

## Database advisor findings

- **Duplicate index (WARN)**: `discovery_signals_current_type_idx` and
  `discovery_signals_type_score_idx` are byte-identical —
  `(signal_type, score DESC) WHERE is_current`. The advisor also lists
  `_type_score_idx` as unused. Verified genuinely identical in `pg_indexes`;
  one of them is pure write overhead.
- **Multiple permissive policies (WARN)**: `player_links` has
  `player_links_select` (SELECT) and `player_links_write` (ALL) both for
  `authenticated` — every SELECT evaluates two policies. Restructuring the
  ALL policy into INSERT/UPDATE/DELETE leaves the exact same access surface
  with one policy per action.
- **76 unindexed foreign keys (INFO)**: almost all on cold paths (audit
  tables, provider-code lookups). The justified subset is small and named in
  the performance migration; the rest are deliberately left alone.
- **31 "unused" indexes (INFO)**: left untouched. Usage stats reset on
  restore, several serve ingestion paths that run weekly, and deleting on a
  young platform's statistics is how you delete the index you need next
  month. Documented, not dropped (except the exact duplicate above).

## Visual audit at the four viewports

The graphite/brass/teal/ochre/brick identity holds together and must not be
genericised. Findings are about hierarchy and reachability, not styling:

- **390/430 (phones)**: the bottom nav is exemplary (56px targets,
  `aria-current`, purpose-built). But the player-filter drawer that the code
  comments promise as "a sheet on mobile" renders as an inline block that
  pushes content; numeric filters commit on blur so Enter does nothing;
  Discover's market chips (~30px) are the page's only control and sit below
  the 44px floor; the profile's sticky tab bar pins to a hardcoded desktop
  header height (`top-[49px]`) and slides under the two-row mobile header.
- **768 (tablet)**: the sidebar appears; `/data` and `/data/sync` both
  highlight when on the sync page (`isActivePath` prefix logic).
- **1440 (desktop)**: pages read well; the biggest desktop-only absence is a
  global search — there is none on any viewport, no `/`, no Cmd/Ctrl+K, while
  three unrelated per-page search boxes exist with different behaviour.

## The ten findings that drive the work

1. **No global search** (`app-shell.tsx` has no search affordance; zero
   keyboard shortcuts app-wide). The single highest-leverage UX gap.
2. **Clubs → players is a dead link**: every one of 806 club rows links to
   `/players?club=…`, a parameter the players page never reads. The page's
   most-repeated interaction silently discards its filter.
3. **`/trends` computes on ≤1,000 of 13,296 players and prints that count as
   fact** — the same defect the clubs page documents having fixed for itself.
4. **The profile fires 20 queries** (9 unbounded), builds all seven tab
   panels eagerly, and its loading state titles the page with a login key.
5. **`/discover`'s market scoping is dead code**: `base(false)` for the
   three main sections means the page contradicts its own intro copy; one
   filter, no presets, no pagination.
6. **Nine routes have no loading state and none stream**: `/data`,
   `/data/quality`, `/data/sync`, `/portfolio`, `/portfolio/new`,
   `/recruitment`, `/recruitment/[id]`, `/settings`, `/team` freeze the
   previous page until the slowest query lands. No `error.tsx` or
   `not-found.tsx` exists anywhere.
7. **`/compare`'s cohort fan-out is unbounded and its percentiles clamp** at
   the row cap while claiming exact ranks. (The honest fix is B2's percentile
   engine; the audit fix is bounding and labelling.)
8. **The uncaveated "No agency listed" chip**: `PlayerListRow` prints the
   bare claim on every list, while the carefully-written "this is not
   evidence the player is unrepresented" caveat lives six clicks deep in the
   Representation tab. The caveat must travel with the chip.
9. **`isActivePath` double-highlights** `/data` while on `/data/sync`; the
   `/representation` surface is reachable only by typing its URL.
10. **The data-quality page paints severity in undefined tokens** —
    `--good/--warn/--bad` fall through to generic Tailwind green/amber/red,
    exactly the red/green pairing the palette rejects for colour-blind
    distinguishability, and `var(--line)` (undefined; the token is
    `--border`) makes table borders draw in bright chalk.

Secondary inventory (kept for the backlog): four incompatible player-card
implementations with three field contracts; i18n adoption at ~40% of surfaces
(14 routes bypass `t()` entirely, including everything a Georgian or Russian
user hits after the dashboard); tab component missing `aria-controls`/arrow
keys; mobile menu sheet without Escape/focus-trap; `/recruitment/[id]` runs
three serial queries (one pulling 2,000 rows to build four dropdowns);
`/settings` queries sequentially; six byte-identical generic skeletons; the
light-mode token set is complete but nothing ever sets `data-theme`.

## What this audit deliberately does not do

- It does not restyle the identity. Brass stays GBM's own layer, teal stays
  corroboration, ochre stays single-source, brick stays conflict.
- It does not delete "unused" indexes on six days of statistics.
- It does not rebuild the percentile/statistics pipeline — that is Phase B2,
  and `v_player_discovery`'s cost profile is one of the reasons B2's CACHE
  stage exists.
