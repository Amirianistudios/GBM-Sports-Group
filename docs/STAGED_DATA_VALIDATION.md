# Staged data validation — a scout's reading

**Validated 2026-08-20**, directly against the production database (SQL over
the live project), after the staged 2,000-player import. 27 real players were
inspected across every category the platform must serve, plus population-level
sanity checks. Nothing below is inferred from the pipeline's own logs.

## Verdict

**The data is clean and scouting-plausible; the staged *cohort* is skewed.**
Every integrity check passed — zero duplicates, zero impossible values, zero
orphans — and every inspected player reads like a correct scouting record.
But the staged selection (`--max-players 2000`, newest-active-first with ties
in dataset order) filled the platform with **veterans**: 97% of players are
30+, and goalkeepers are over-represented at 20.6%. The young-talent segment
exists and is superb (Yamal, Estêvão, Doué, Huijsen…) but numbers only 18,
inherited from the original seed. This is a **sampling artifact, not a data
defect**, and the full import removes it. Feature-by-feature consequences are
at the end.

## 1. Cohort shape (2,030 players)

| Dimension | Reading |
|---|---|
| Age | 0 U18 · 18 aged 18–21 · 9 aged 22–25 · 33 aged 26–29 · **1,970 aged 30+** |
| Positions | GK 419 · CB 391 · CF 244 · CM 182 · RB 164 · DM 163 · AM 142 · LB 111 · LW 85 · RW 78 · LM/RM 38 — every profile present |
| Goalkeepers | 419 (20.6% — over-represented; long careers put them early in the dataset ordering) |
| Georgia | 7 nationals, all veterans (33–40) in European leagues; **the Georgian domestic league is not in the dataset's 65 competitions** |
| Africa | **70 nationals across 11 countries** (Egypt, Morocco, Senegal, Côte d'Ivoire, Nigeria, Ghana, Tunisia, Algeria, Cameroon, Guinea, South Africa) — incl. two elite U21 prospects; African domestic leagues are not in the dataset |
| Belgium | 40 Belgian nationals; **144 players with 2025/26 Jupiler Pro League minutes** (league filtering through season stats works) |
| Latest season | 2025/2026, with minutes through the season |

## 2. The 27-player sample

Every player verified for identity, age, nationality, position, club,
provider identities, statistics (appearances/minutes/goals/assists), market
value history, transfers, contract where the source carries one, and signals.
Values are the June 2026 Transfermarkt refresh.

**Elite** — Lewandowski (37, Barcelona: 663 career apps, 526 goals, 58 stat
rows, 9 providers, €7m), Salah (34, Liverpool: 574/308, €22m), De Bruyne (35,
Napoli: 220 career assists), Alaba, Blind, Neuer (40, GK), Müller (36, MLS
move captured), Courtois, Dimarco, Grimaldo.

**U21 / prospects** — Yamal (19, RW: €200m, 2,270 minutes 25/26, contract
2031, 8 providers), Doué (21: €120m, one current signal), Estêvão (19,
Chelsea: €80m), Huijsen (21, CB: €60m, 8 transfers incl. loans), Lewis-Skelly
(19, LB), O'Reilly (21, LB: €70m). Career totals for teenagers correctly
include their youth-competition appearances.

**Georgia** — Kvilitaia (32, Metz, €900k, signal), Zivzivadze (32,
Heidenheim, 14 transfers — a genuinely journeyed career, correctly recorded),
Kashia (39, no club — coherent: contract expired 2026-06-30, value €150k in
May, end-of-career free agent, not stale data).

**Africa** — Bouaddi (18, Morocco, Lille: €50m, 9 providers, 2 signals — the
exact profile GBM exists to find), Diomande (19, Côte d'Ivoire, Leipzig:
€90m), Salah, Khedira (Tunisia), Sliti (Tunisia — see limitations).

**Belgium** — De Bruyne, Trossard, Courtois (nationals); Vanaken (Club
Brugge), Roef (Gent, 2,700 minutes 25/26), Coosemans (Anderlecht) — real
BE1 regulars with full current-season minutes.

## 3. Integrity checks — all clean

| Check | Result |
|---|---|
| Duplicate players (same normalised name + DOB) | **0** |
| Minutes exceeding matches × 120 | **0** |
| Negative statistics | **0** |
| Ages under 14 / over 50 | **0** |
| Height outliers (<150 / >215 cm) | **0** |
| Self-transfers (from = to) | **0** |
| Stat rows with orphaned season | **0** |
| Goal counts beyond plausibility (>5/match sustained) | **0** |
| "Future" transfers | 8 — all legitimately pre-announced moves with future effective dates (through 2027-07-01), not corruption |
| Freshness | Newest valuation 2026-06-11; newest completed transfer window captured; dataset release 2026-08-05 |

## 4. Known limitations (real, documented, none invented away)

1. **The age skew** (above). Fix: scale the import; the selection cap, not
   the pipeline, caused it.
2. **Coverage boundary = the dataset's 65 competitions.** A player leaving
   them goes statistically dark while remaining in the identity graph —
   e.g. Naïm Sliti (Tunisia): last valuation 2023, no current club shown,
   because his recent career is in a league the dataset does not carry. The
   platform shows exactly what the source knows and when it last knew it.
3. **Georgian and African domestic leagues are absent** — and will remain
   absent even at full import, because the dataset does not cover them.
   Reaching them is the already-researched youth/BeSoccer/API-Football
   roadmap in `DATA_SOURCES.md`, not an import setting. This matters
   because GBM's actual signed client book (see `GBM_BRAND_ANALYSIS.md`) is
   concentrated precisely there.
4. **517 players (25%) have no season statistics** — dominated by veteran
   squad players and keepers with no recorded 65-competition appearances in
   the covered window; their identity, value and transfer data are intact.
5. **63 players (3%) have no market value** — plausible for fringe veterans.
6. **`matches` / match-level statistics are 0 by design** (deferred
   increment); season aggregates carry the current product.
7. **Advanced metrics (xG, xA, duels…) are NULL** pending a licensed
   provider — columns exist, the platform must label them honestly rather
   than fake them.
8. **Contract expiry is missing for some elite players** (Lewandowski,
   Salah, Alaba) — blank at the source; shown as unknown, never guessed.

## 5. What this cohort can and cannot validate, per feature

| Feature | Verdict with this cohort |
|---|---|
| Player profile page | **Fully validatable** — rich careers, values, transfers, multi-provider identity on every sampled player |
| Discovery filters | **Validatable** — every filter dimension has data; but "young talent" queries return the thin elite-18 slice, so the *experience* of unearthing unknowns cannot be felt yet |
| Comparison / per-90s | **Validatable within position cohorts** — 1,513 players hold 2025/26 minutes; percentiles must be labelled as "within currently imported players" |
| Shortlists / scouting workflow | **Fully validatable** — independent of cohort shape |
| Signals | Computed and current (1,026), but CONTRACT_EXPIRING dominates in a veteran cohort — expected |

**Recommendation carried to the final report:** proceed with the build and
test against this data; scale the import (which corrects the age skew
mechanically) only after the experience is reviewed, per the phase's rule.
