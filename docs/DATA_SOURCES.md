# Data sources — decision matrix

One-page summary of which external sources GBM uses, will use, and has ruled out.
Full evidence for every verdict is in
[`DATA_SOURCE_RESEARCH.md`](DATA_SOURCE_RESEARCH.md); the youth position is in
[`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md).

Assessed 2026-08-19; re-verified and updated 2026-08-20 after the first
end-to-end pipeline run (see `GBM_CURRENT_STATE_AUDIT.md` §5 and
`GBM_DATA_IMPLEMENTATION_PLAN.md`).

## Status

| Source | Status | Cost | What GBM uses it for |
|---|---|---|---|
| Transfermarkt dataset | **LIVE** | free | Bio, market values, transfers, contracts, agent names, counting season statistics (appearances) |
| Reep v1 register | **LIVE** | free | Cross-provider identity — resolver migrated 2026-08-20; matched 99.7% of the staged import set |
| Reep v0 register | **RETIRED — rows kept** | free | Frozen 21 Jun 2026; its `v0-wikidata` identities remain as provenance |
| API-Football | **CONNECTED** (Free tier) | $0 → $19/mo | Season and match statistics, injuries, youth competitions |
| Wyscout | **PRICE IT** | quote | Advanced metrics, per-90s, positional percentiles |
| BeSoccer | **INVESTIGATE** | quote | Spanish tiers 6–8, LatAm lower divisions, contracts, injuries |
| Wikipedia / Wikidata youth squads | **BUILD** | free | Youth tournament squads — the only clean licence in the set |
| Premier League (Pulselive) | **BUILD (U21 first)** | free | Academy players, plus free Opta join keys |
| StatsBomb Open Data | **RESEARCH ONLY** | free | Develop and validate age-adjustment methodology |
| UEFA youth feeds | **LICENCE FIRST** | unknown | Youth League and youth Euros |
| Wikidata (direct) | **LATER, NARROW** | free | Club history only; Reep already extracted the rest |
| FIFA API | **NO** | — | Terms bar GBM's use, despite carrying no dates of birth |
| Sofascore | **NO** | — | Cannot sublicense at any price |
| FotMob | **NO** | — | Cannot sublicense at any price |
| FBref | **NO** | — | Advanced data deleted Jan 2026; terms bar GBM's use |
| Understat | **NO** | — | Blanket `Disallow: /`; shot data only |
| SportMonks | **NO** | — | 2.5% identity coverage of GBM's squad |
| SportDB | **NO** | — | Paid key over a free MIT scraper; no legal entity |
| National federation sites | **NO** | — | No structured squad data anywhere |

## Capability matrix

Only sources GBM will actually use. **D** = derivable rather than served.

| | Bio | Market value | Contract | Agency | Season stats | Match stats | Advanced | Transfers | Youth | Injuries |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Transfermarkt dataset | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | — | — |
| Reep v1 | ✓ | — | — | — | — | — | — | — | partial | — |
| API-Football | ✓ | — | — | — | ✓ | ✓ | — | weak | ✓ | ✓ |
| Wyscout | ✓ | — | ✓ | ✓ | ✓ | ✓ | **✓** | ✓ | ✓ | — |
| BeSoccer | ✓ | ✓ | ✓ | ? | ✓ | ✓ | — | ✓ | partial | ✓ |
| Wikipedia youth | ✓ | — | — | — | — | — | — | — | **✓** | — |
| Premier League | ✓ | — | — | — | ✓ | ✓ | — | — | **✓** | — |
| StatsBomb Open | ✓ | — | — | — | D | D | **D** | — | — | — |

`?` = BeSoccer's `bs_agent` field exists but was null in sampling. Test it on a
lower-division player before assuming it populates.

## Identity coverage

Two generations of measurement, kept side by side because the change matters.

**Reep v0 register (measured 2026-08-19** by joining against GBM's
`data/players.csv`, active-2025 squad of 22,292):

| Provider | Coverage |
|---|---:|
| IMPECT | 71.4% |
| **Wyscout** | **63.7%** |
| API-Football | 59.5% |
| SportMonks | 2.5% |

**Reep v1 register (measured 2026-08-20** on the staged import set — 2,120
players, newest active first — release `20260820T103440Z`, curated bridges
only, exact joins at confidence 0.99):

| Provider | Players resolved | Share |
|---|---:|---:|
| TRANSFERMARKT (live site) | 2,114 | 99.7% |
| REEP v1 entity | 2,114 | 99.7% |
| **WYSCOUT** | **2,103** | **99.2%** |
| SPORTMONKS | 2,040 | 96.2% |
| API_FOOTBALL | 1,959 | 92.4% |
| STATSBOMB (open-data ids) | 1,592 | 75.1% |
| UNDERSTAT | 809 | 38.2% |
| FBREF | 509 | 24.0% |

Notes that change earlier reasoning:

- **SportMonks' identity blocker is gone** — v1 carries it at 96%, not v0's
  2.5%. Its AVOID verdict now rests only on capability and price (no advanced
  metrics; €249/mo for 120 stat leagues vs API-Football's all-competitions
  $19), which still stands — but revisit-at-Enterprise is now a real option.
- **Sofascore, FotMob and Wikidata are absent from v1's curated bridges** —
  in v1 they live in the 0.85-confidence overlay, which GBM deliberately does
  not auto-ingest (below the auto-accept floor in `entity_resolution_rules`).
  The v0-derived ids for early sample players remain stored.
- **StatsBomb *ids* are stored; StatsBomb *data* stays out.** The id mapping
  is the register's CC0 assertion. The data itself is governed by the
  StatsBomb Public Data User Agreement (below), which GBM cannot satisfy.

## API-Football: connected, and why the free tier is not enough

Adapter live at `packages/providers/src/apifootball/`; probe with
`pnpm apifootball:test`.

Verified against the live key on 2026-08-19: the **Free plan is restricted to
seasons 2022-2024**. Requesting the current season returns, verbatim,
`"Free plans do not have access to this season, try from 2022 to 2024."` with
zero results — and because this API reports plan violations **inside an HTTP 200
response**, an adapter that trusted the status code would read that as a player
with no matches rather than as an access error. The adapter treats a populated
`errors` field as a thrown error for exactly this reason.

A scouting platform needs the current season, so **Pro at $19/month is required
for real use**. The free tier is sufficient to develop and test against.

Confirmed present in the data: appearances, minutes, goals, assists, cards,
shots, passes, key passes, dribbles, **duels and tackles**, plus a composite
rating. Confirmed absent: xG, progressive passes and carries, touches in box,
and anything positional or event-level.

## Licence, cadence, reliability, commercial suitability

The operating table for every source GBM touches or explicitly refuses.
"Commercial use" means inside GBM's authenticated internal platform;
*publishing* data to clients or players is a separate question that every
provider row below answers more restrictively. Verified dates as noted.

| Source | Purpose | Update frequency | Licence considerations | Reliability | Commercial use (internal) |
|---|---|---|---|---|---|
| Transfermarkt dataset (`dcaribou`) | Bio, values, transfers, contracts, agents, counting stats | Weekly publishes; last observed 2026-08-05 (a 15-day gap at 2026-08-20 — upstream scraper blocks are a live risk) | Repo is CC0-1.0, but the data is scraped from Transfermarkt: underlying-rights exposure sits with the consumer | High — versioned releases, HEAD-revalidated, manifest-pinned; pipeline proven end-to-end 2026-08-20 | **Yes, with the scraped-origin caveat recorded**; never republish |
| Reep v1 register | Cross-provider identity | Weekly releases (three observed inside 10 days) | CC0 1.0 dedicated in the release itself, bridges included, commercial use expressly allowed | High — checksummed files, release stamps, redirects for merged entities | **Yes** |
| API-Football | Season/match stats, injuries, youth | Live API; free tier limited to seasons 2022–2024 | ToS permits storage; grants **no publication rights** ("license to publish must be requested from the competent authorities") | Good; reports errors inside HTTP 200 — adapter unwraps them | **Yes for internal use at Pro $19/mo**; publication barred |
| Wyscout | Advanced metrics, per-90s, percentiles | Live API | Commercial licence to negotiate; adapter already written | Unknown until trialled | Pending quote |
| BeSoccer | Long-tail contracts, injuries, lower divisions | Live API | Quote-only; **storage rights unresolved** — `source_records` retains payloads permanently, so ask before building | Untested | Pending quote + storage answer |
| StatsBomb Open Data | Event-data methodology reference | Occasional (last 2026-05-26) | Public Data User Agreement (decoded 2026-08-20): research tool; no distribution; **no commercial exploitation of the data or any analysis derived from it**; revocable | High data quality; wrong player population | **No** — ids from Reep are stored, the data itself stays out unless counsel clears it |
| Wikipedia youth squads | Youth tournament squads | Event-driven, days after announcements | CC BY-SA — the only unconditionally clean licence in the set | Good for names/positions/clubs; 43% DOB coverage | **Yes with attribution — and only behind the `YOUTH_AND_MINORS.md` safeguards** |
| `felipeall/transfermarkt-api` | Endpoint documentation only | Unmaintained (last commit 2025-04-13) | MIT code, but it live-scrapes Transfermarkt | Parser-rot risk; demo instance rate-limited | Not for the pipeline; reference only |
| Kaggle mirrors (player-scores; sofascore+TM; statsbomb) | None | Mirror cadence / stale | Inherit their upstreams' problems; the StatsBomb mirror likely breaches its own source agreement | Redundant | **No** — use the canonical sources above |
| Sofascore / FotMob / FBref / Understat (ingestion) | — | — | Opta-downstream terms; FBref advanced data deleted 1/2026; Understat blanket robots disallow | — | **No**; deep links for manual scout use only |

## The rule that shaped these verdicts

Most free football data is downstream of **Opta / Stats Perform**, which does not
permit sublicensing. Sofascore, FotMob and FBref were each closed by that single
fact rather than by three separate ones — which is why "find another free
aggregator" is not a strategy, and why advanced metrics have to be licensed.

Youth football is the exception: no major provider covers it well, and Wikipedia
publishes it under CC BY-SA. That is where GBM's edge is, and it is also where
the legal constraints are real rather than contractual.
