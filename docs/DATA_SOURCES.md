# Data sources — decision matrix

One-page summary of which external sources GBM uses, will use, and has ruled out.
Full evidence for every verdict is in
[`DATA_SOURCE_RESEARCH.md`](DATA_SOURCE_RESEARCH.md); the youth position is in
[`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md).

Assessed 2026-08-19.

## Status

| Source | Status | Cost | What GBM uses it for |
|---|---|---|---|
| Transfermarkt dataset | **LIVE** | free | Bio, market values, transfers, contracts, agent names |
| Reep v0 register | **LIVE — migrate to v1** | free | Cross-provider identity |
| Reep v1 register | **ADOPT NEXT** | free | 3.8× the entities; v0 is frozen |
| API-Football | **BUY** | $19/mo | Season and match statistics, injuries, youth competitions |
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

Measured by joining the Reep register against GBM's actual `data/players.csv`.
This is why SportMonks was rejected and why Wyscout beats API-Football on
identity as well as capability.

| Provider | GBM's active 2025 squad (22,292) |
|---|---:|
| IMPECT | 71.4% |
| **Wyscout** | **63.7%** |
| API-Football | 59.5% |
| SportMonks | 2.5% |

## The rule that shaped these verdicts

Most free football data is downstream of **Opta / Stats Perform**, which does not
permit sublicensing. Sofascore, FotMob and FBref were each closed by that single
fact rather than by three separate ones — which is why "find another free
aggregator" is not a strategy, and why advanced metrics have to be licensed.

Youth football is the exception: no major provider covers it well, and Wikipedia
publishes it under CC BY-SA. That is where GBM's edge is, and it is also where
the legal constraints are real rather than contractual.
