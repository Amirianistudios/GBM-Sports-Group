# Entity resolution

How a GBM player acquires the provider identities that everything else hangs
off. Verified 2026-08-28 against Reep release `20260826T221009Z`.

## The rule that does not bend

`players.id` is a GBM UUID. A provider id is never a primary key. Provider ids
live in `player_external_ids` with a `confidence` and a `match_method`, so the
identity graph survives any single provider disappearing.

## The register

[Reep](https://reep.football) publishes a **CC0-1.0** cross-provider bridge
register. GBM reads it from `data.reep.football`, which is plain object storage
— no API key, no rate limit, no terms to negotiate.

    latest.json  →  release.json  →  csv/bridges.csv.gz

`bridges.csv` is four columns:

    provider,namespace,external_id,reep_id

Two players are the same person when their Transfermarkt ids bridge to the same
`reep_id`. Nothing is fuzzy: the resolver matches Transfermarkt id to
Transfermarkt id through the register and takes whatever else that identity
carries.

Release `20260826T221009Z` holds **5,868,269 bridges** over 1,876,191 entities.

## Namespaces are provider-native, and getting one wrong is silent

Each provider keys on its own vocabulary. Transfermarkt uses its URL segment —
`spieler` is a player, `spiel` a match, `verein` a club, `trainer` a coach. The
Opta family uses `person`. StatsBomb uses `offline_player`.

An earlier revision assumed every provider used `player` and matched **0 of
5.2M bridges**. It did not error; it simply enriched nothing. The namespace is
part of the map for that reason, and `bridges.test.ts` pins it.

## The map

| register slug | namespace | GBM provider | sample coverage |
|---|---|---|---:|
| `transfermarkt` | `spieler` | TRANSFERMARKT | anchor |
| `opta` | `person` | OPTA | 98% |
| `wyscout` | `player` | WYSCOUT | 98% |
| `sportmonks` | `player` | SPORTMONKS | 91% |
| `fifa` | `person` | FIFA | 88% |
| `besoccer` | `player` | BESOCCER | 81% |
| `espn` | `person` | ESPN | 77% |
| `capology` | `player` | CAPOLOGY | 50% |
| `uefa` | `player` | UEFA | 25% |
| `api_football` | `player` | API_FOOTBALL | — |
| `fbref` | `person` | FBREF | — |
| `understat` | `player` | UNDERSTAT | — |
| `statsbomb` | `offline_player` | STATSBOMB | — |

Coverage measured on 297 GBM Transfermarkt ids, of which **296 (99.7%)**
resolved.

Every id shape was checked before its slug was mapped: besoccer and espn are
6–7 digit numerics, uefa numeric, opta and fifa share a 25-character
alphanumeric family, capology is a name slug ending in its numeric id.

## What is deliberately not mapped

**`fm` — 141,801 player bridges, 76% coverage, and not FotMob.**

This is the most valuable-looking entry in the register and the one most likely
to be mapped by someone in a hurry. The evidence it is not FotMob:

- FotMob player ids are ~6 digits. `fm` ids are 8 digits (64,868 of them) and
  10 digits (59,006); only 4,431 are 6.
- Kevin De Bruyne's real FotMob id, `172780`, is absent from the `fm` set.
- `fotmob.com/players/<anything>` answers 200 — a single-page app — so probing
  a URL cannot confirm or deny an id. This is the trap: the obvious check
  passes for every id, including wrong ones.

The shape is consistent with Football Manager. Mapping it would write ~6,000
wrong FotMob ids at confidence 0.99 into the table the whole platform trusts
for identity. `bridges.test.ts` fails if anyone adds it.

**Sofascore — zero rows in the register, any namespace.** GBM's 5,684
Sofascore ids came from its own collection; Reep cannot extend them, and a
bridge invented here would be fabrication.

**`eafc`, `skillcorner`, `jleague`, `second_spectrum`, `soccerdonna`,
`national_football_teams`** — real, unambiguous, and left unmapped until GBM
has a reason to consume them. Bridges outside the map are counted and reported
by every run, never written.

## Confidence and provenance

Every row the resolver writes carries:

    match_method  REEP_REGISTER
    confidence    0.99
    verified_at   the run timestamp

0.99 rather than 1.0 because the register is an assertion by a third party,
however good. GBM's own corrections are `GBM_INTERNAL` at priority 100 and
always win.

Uncertain matches are not written. They belong in
`entity_resolution_candidates` for review — an automatic identity decision that
nobody sees is the same class of mistake as an automatic merge.

## Running it

    pnpm reep:resolve

or the `reep-enrich` workflow, weekly on Thursday 05:00 UTC, which is where the
service-role key lives. Idempotent: ids already held are skipped, so a re-run
against an unchanged release writes nothing. Every run opens and closes an
`ingestion_runs` row.

## Known gaps

- **Only 7,822 of 13,296 players hold a Transfermarkt id**, and the resolver
  anchors on Transfermarkt. The other 5,474 cannot be resolved this way; they
  need either a Transfermarkt id first or a different anchor.
- **25 players hold two different ids for the same provider** — surfaced by
  `gbm_data_quality_report()`, and each one means one of the two is wrong.
- **5 provider ids point at more than one GBM player**, which is the same
  problem seen from the other side.

## Related

- [`DATA_SOURCE_RESEARCH.md`](DATA_SOURCE_RESEARCH.md) — reachability, measured.
- [`DATA_QUALITY.md`](DATA_QUALITY.md) — the checks that catch identity drift.
- [`AUTOMATION.md`](AUTOMATION.md) — when this runs.
