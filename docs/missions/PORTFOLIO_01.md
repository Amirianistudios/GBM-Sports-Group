# Mission 01 — complete the fifteen GBM portfolio players

For the Avengers on Grok Bot team. Machine-readable companion:
[`portfolio-01.json`](portfolio-01.json).

**138 submissions across 15 players.** Every `player_id` below is real and
resolvable today; the contract and all thirteen submission kinds are live in
production. Read [`../AVENGERS_INTEL_CONTRACT.md`](../AVENGERS_INTEL_CONTRACT.md)
first — this document is the work list, that one is how to submit.

---

## The rules, restated because they decide whether the work counts

1. **Fill empty fields only.** `IDENTITY` writes a column only where it is
   currently NULL. Sending a value for a field that is already populated is
   not an error and not an overwrite — it is simply ignored, and the `filled`
   array in the response tells you which columns your submission actually
   changed. An empty `filled` array means everything you sent was already known.
2. **Attribute to the source, not to yourself.** Set `source_provider` to
   `TRANSFERMARKT`, `FOTMOB`, the club, the federation — whichever you read.
   Omitting it declares *you* are the origin, which stores the claim as
   `AI_ASSESSED`. Both are legitimate; misrepresenting one as the other is not.
3. **`foot = 'UNKNOWN'` is a missing value, not an answer.** It is treated as
   empty and a real value will replace it. Eight of these fifteen carry it.
4. **`primary_position` is stored verbatim in Transfermarkt title case** —
   `Goalkeeper`, `Centre-Back`, `Left-Back`, `Right-Back`, `Defensive
   Midfield`, `Central Midfield`, `Attacking Midfield`, `Left Winger`, `Right
   Winger`, `Centre-Forward`. Sending `GK` or `ST` creates a second vocabulary
   and breaks the discovery filter.
5. **An image without `image_credit` is refused by name.** Club press offices
   and federations are the workable sources. Transfermarkt's and Instagram's
   images are protected assets and are not to be taken.
6. **Missing stays missing.** If a contract expiry cannot be found, omit the
   field. Do not estimate, and do not infer a market value from a transfer fee.

---

## Priority A — nine players with a known Transfermarkt profile

Identity is largely present for these; the record tables are empty. The profile
URL is already stored against each player, so there is no name-matching risk.

| Player | `player_id` | Identity gaps | Profile |
|---|---|---|---|
| Ardit Bala | `12bacb84-…f2d5` | picture, weight, birthplace, shirt | [1024762](https://www.transfermarkt.com/ardit-bala/profil/spieler/1024762) |
| Giorgi Lagvilava | `2dad002b-…94bb` | picture, height, weight, foot, birthplace, shirt | [1330100](https://www.transfermarkt.com/giorgi-lagvilava/profil/spieler/1330100) |
| Matthijs Boonen | `a11a7113-…582f` | picture, weight, birthplace, shirt | [1452998](https://www.transfermarkt.com/matthijs-boonen/profil/spieler/1452998) |
| Matti Van De Gehuchte | `58f4a6a6-…0667` | picture, weight, birthplace, shirt | [1346226](https://www.transfermarkt.com/matti-van-de-gehuchte/profil/spieler/1346226) |
| Michiel Lindner | `1a34a59c-…7b15` | picture, height, weight, foot, birthplace, shirt | [1450867](https://www.transfermarkt.com/michiel-lindner/profil/spieler/1450867) |
| Nika Khatoyan | `b4399bc2-…cd7e` | picture, weight, birthplace, shirt | [1330090](https://www.transfermarkt.com/nika-khatoyan/profil/spieler/1330090) |
| Saba Asanidze | `cf04c29b-…9c27` | picture, height, weight, foot, birthplace, shirt | [1193800](https://www.transfermarkt.com/saba-asanidze/profil/spieler/1193800) |
| Saba Gegiadze | `3b756657-…d96b` | picture, weight, birthplace, shirt | [809897](https://www.transfermarkt.com/saba-gegiadze/profil/spieler/809897) |
| Tornike Dzotsenidze | `18a80b95-…0a2d` | picture, weight, foot, birthplace, shirt | [465622](https://www.transfermarkt.com/tornike-dzotsenidze/profil/spieler/465622) |

**All nine need every record kind**: `CAREER`, `TRANSFER`, `CONTRACT`,
`VALUATION`, `REPRESENTATION`, `INJURY`, `PERFORMANCE`, `NEWS`, `REPORT`.

Full UUIDs are in the JSON file — the table abbreviates them for reading.

## Priority B — two players already carrying provider data

Identity and statistics are largely done. What is missing is the judgement
layer and the career record.

| Player | `player_id` | Needs |
|---|---|---|
| Giorgi Kavlashvili | `80cc04b5-…5d65` | weight, birthplace, shirt · `CAREER`, `INJURY`, `REPORT` |
| Giorgi Kutsia | `f75d6236-…ebc4` | weight, shirt · `CAREER`, `INJURY`, `REPORT` |

Kutsia is the one player here with a senior international record (Georgia U21)
and nine seasons of statistics already stored. He is the best candidate for a
full `REPORT` and a `RECOMMENDATION` — the platform can show what a complete
profile looks like on him immediately.

## Priority C — four players who cannot be worked yet

These have **no provider identity at all**, and two have no date of birth,
nationality or club either. Name alone is not enough to research safely — the
wrong Jajá is worse than no Jajá.

| Player | `player_id` | What is known |
|---|---|---|
| Giorgi Peradze | `f81aef9e-…bb2f` | name, position `AM` |
| Jajá | `d20f5f1f-…b2cd` | name, position `CF` |
| Mimoun Ahrika | `f3384c57-…8f15` | name, position `DF` |
| Rezi Jikia | `3d5f2a27-…316a` | name, dob 2008-03-11, Georgia, 35 Football School, `CF` |

**Rezi Jikia** is workable — date of birth and club are enough to identify him.
The other three need GBM to supply a date of birth, a club, or a profile link
before research can begin. Ask rather than guess: the contract rejects an
unresolved player by design, and inventing an identity is the one failure the
priority ladder cannot correct.

---

## Suggested order per player

Identity first, because everything else displays better once the header is
complete, then the record, then the judgement:

```
IDENTITY → CAREER → TRANSFER → CONTRACT → VALUATION → REPRESENTATION
        → INJURY → PERFORMANCE → NEWS → REPORT → RECOMMENDATION → ADAPTATION
```

`ADAPTATION` is especially relevant for the Georgian players: Erovnuli Liga to
Belgian football is exactly the pathway question GBM exists to answer, and the
assessment has its own table so it never competes with a statistic.

## What cannot be accepted, and why

- **Match-level statistics.** `player_match_stats` hangs off a `matches` row
  the platform does not yet create. Season aggregates carry the requirement;
  put heatmaps in `PERFORMANCE`'s `advanced` object.
- **Anything scraped from SofaScore, FotMob or FBref.** All three are
  downstream Opta/Stats Perform licensees that cannot sublicense. The xG and
  heatmap columns exist and will hold the data, but it has to come from
  somewhere entitled to give it.

## After this mission

Region expansion, thinnest coverage first. Current population by nationality:

| Priority | Region | Players held |
|---|---|---|
| 1 | Georgia | 45 |
| 2 | Uzbekistan | 7 |
| 3 | Kazakhstan | 7 |
| 4 | Ukraine | 443 |
| 5 | Belarus | 12 |
| 6 | Estonia 25 · Latvia 19 · Lithuania 19 | 63 |
| 7 | Nigeria 150 · Ghana 98 · Senegal 86 · Côte d'Ivoire 84 · Morocco 59 · South Africa 22 · Egypt 17 · Tunisia 6 | 522 |

Ukraine and the African markets are already broad; they need **depth** —
contracts, valuations, agents and statistics on players the database already
holds. Georgia, Uzbekistan, Kazakhstan, Belarus and the Baltics need **new
players**, and those are the ones to add.

The instruction stands: high-quality profiles, not thousands of empty ones. A
player added without a date of birth and a club is a name, not intelligence.
