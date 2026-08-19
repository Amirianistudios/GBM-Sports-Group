# Data source research

Assessment of external football data sources for GBM Intelligence.

**Status: IN PROGRESS.** Eight sources were investigated in parallel on
2026-08-19. Three are complete and recorded below; five are still outstanding
and marked as such. Nothing here is written from recall — every verdict cites
what was actually fetched, and anything a researcher could not verify against a
live source this session is labelled UNVERIFIED.

---

## The finding that governs everything else

Four independent routes to position-specific advanced metrics — the xG, xA,
progressive passes, carries, aerial duels and pressures that GBM's talent
engine needs — were investigated. All four are closed, and they are closed for
**one shared reason rather than four separate ones**:

> **Opta / Stats Perform sits upstream of the entire free tier, and does not
> let value leak downstream.**

- **Sofascore** is a downstream licensee. Its own support documentation states
  it cannot share endpoints because of agreements with its data providers.
  There is therefore no "pay for it properly" version of this integration.
- **FotMob** is in the same position — its advanced metrics are Opta-supplied.
- **FBref** *had* exactly what GBM wanted, including pre-built percentile
  scouting reports. Stats Perform terminated the licence and the data was
  **deleted in January 2026**, historical seasons included, so it cannot even
  be backfilled. No replacement seven months on.
- **StatsBomb Open Data** is genuinely free and legally clean by comparison,
  but covers the wrong players (see below).
- **Understat** survives on licensing grounds only in the sense that it is not
  Opta-derived — but it disallows all crawling in `robots.txt`, covers just six
  elite top-flight leagues, and carries shot data alone. It cannot support
  position-specific evaluation.

This is a market structure, not a run of bad luck. Further research into free
sources for advanced metrics is not expected to change the answer and is not
recommended.

**The practical consequence: advanced metrics must be licensed, not collected.**
See *Where this leaves GBM* at the end.

---

## Sofascore — AVOID

**What it uniquely offered:** the Sofascore per-match player rating (0–10),
plus heatmaps, shotmaps and average positions. There is no free equivalent of
that rating anywhere.

**Why not:** three independent ToS prohibitions — commercial use, derivative
use, and automated collection — any one of which GBM would breach. Sofascore
is itself downstream-licensed and contractually **cannot sublicense at any
price**, so no commercial agreement is available. Access now also requires
defeating bot protection: `api.sofascore.com/api/v1/player/{id}` returned HTTP
403 from Varnish even with full browser headers, and `robots.txt` itself
returns 403, so crawl permission cannot be established even in principle. Both
maintained client libraries (ScraperFC, sofascore-wrapper) ship anti-detection
browser automation, which is the tell.

**What GBM keeps:** `key_sofascore` from Reep, as a deep link a scout clicks by
hand. A human opening a web page breaks nothing. `SOFASCORE` stays in
`ProviderCode` as reserved-but-unimplemented.

---

## FotMob — AVOID

**What it uniquely offered:** per-shot xG and xG-on-target with coordinates,
occurrence-weighted positions, and second-tier and youth career lines that
Transfermarkt does not carry.

**Why not:** the same structural trap. FotMob licenses from Opta/Stats Perform
and cannot sublicense; its terms forbid scraping and commercial use as
independent prohibitions. The JSON API requires a client-generated `x-mas`
header and returns **404 with a zero-byte body** without it — it denies the
resource exists, which would silently corrupt any adapter's coverage rather
than failing loudly. Every third-party wrapper is dead or stale, and
`soccerdata` has removed FotMob support entirely.

**What GBM keeps:** `key_fotmob` is already in Reep, already coded in
`services/ingestion/src/reep/resolve.ts`, and already resolves to a live
profile URL. The identity value is banked at zero risk — ingestion would buy
marginal data, not a missing capability.

---

## FBref — AVOID

Two reasons, each sufficient alone.

**1. The data is gone.** FBref's advanced metrics were Opta-derived (not
StatsBomb, contrary to common belief — that partnership ended in 2022). Stats
Perform terminated the feed and FBref deleted the advanced tier in January
2026, including historical seasons. The percentile scouting-report pages —
which were essentially GBM's position-specific evaluation requirement, pre-built
— went with it.

> **Trap for future work:** `soccerdata` and `worldfootballR` still document the
> full metric set, and every tutorial predates the removal. Library support is
> *not* evidence the data exists. An adapter would return removed metrics as
> `undefined` rather than as errors, and GBM would compute position percentiles
> over empty columns and ship confident rankings built on nothing.

**2. The terms prohibit it — verbatim, retrieved by browser.** `robots.txt` is
*not* the barrier: `Disallow: /players/` and `/teams/` are commented out, so
crawling is permitted for a generic user-agent. The Site Terms, quoted at
`sports-reference.com/data_use.html`, are the deciding instrument. The
automated-access clause is narrow — it bites only where crawling "adversely
impacts site performance" — but two others are unqualified:

- No using content to *"create any database … that competes with or constitutes
  a material substitute for the services or data stores offered … by the Site's
  Data Providers"*. A scouting database is precisely that.
- No using content for *"machine learning methods used to predict, classify,
  label, or score inputs into the models"*. This is broader than the usual
  generative-AI boilerplate: it names scoring and classification, which is a
  literal description of GBM's talent engine.

Sports Reference concedes facts are not copyrightable, but contract binds
beyond copyright and UK/EU database right is a separate regime. Their $5,000
floor for custom data requests indicates the commercial posture.

*UNVERIFIED: the January 2026 termination account itself. Corroborated across
independent secondary sources, but Sports Reference's own blog post 403s to a
plain client and was not read.*

---

## StatsBomb Open Data — INVESTIGATE (research corpus only, not the product)

**The schema is the best available anywhere, free or paid.** Every metric GBM
needs is present or exactly derivable: per-shot xG with freeze-frames, aerial
duels, and **pressures as a first-class event type** — the metric FBref lost in
2022 and never regained. Progressive passes and carries are computable from
start and end coordinates on every event, meaning GBM defines "progressive"
itself rather than inheriting a vendor's definition. Given the age-adjustment
goal, computing per-90s and percentiles in-house is the right side of the line.

**But it covers the wrong players.** Enumerated in full from
`data/competitions.json`: 24 competitions. No current-season coverage of any
major men's European league. The Premier League appears for two seasons, the
more recent being **2015/16**. Densest men's coverage is La Liga 2004–2021 and
Champions League to 2018/19. Youth coverage is a single 1979 tournament.
Players with deep event histories here are overwhelmingly retired or
late-career. It is a corpus for building and validating a model, not a source
of players to scout.

**Two blockers beyond coverage:**

- **Licence.** Released for public *non-commercial* use with mandatory
  attribution and logo on any published output. GBM is a commercial agency
  platform. *UNVERIFIED: `LICENSE.pdf` could not be read (no text extraction).
  A human must read it and rule on commercial use before any ingestion — do not
  let anyone infer this.*
- **Identity is unsolved.** Reep does **not** carry a StatsBomb id (it covers
  Sofascore, FotMob, Wyscout, FBref, Understat, BeSoccer, SportMonks,
  API-Football, Impect, Wikidata). Ingestion would require name + DOB +
  club-season fuzzy matching through `entity_resolution_candidates` — precisely
  the matching most likely to produce silent false positives on historical
  players with sparse metadata.

**Honest role:** develop and validate the position-benchmark and age-adjustment
methodology here before paying for a licensed feed. Real value even with zero
scoutable players.

> **Methodological trap:** La Liga 2004–2021 and Champions League knockouts are
> an elite-skewed sample. Benchmarks fitted on it will systematically misprice
> players at the levels GBM actually recruits from. This will not announce
> itself in any data-quality check.

---

## Understat — AVOID for ingestion (narrow manual reference only)

*Assessed directly rather than by a research agent: the assigned agent idled
three times without returning findings, so this was verified by hand.*

**The last free xG candidate, and it does not rescue the position.** Two facts
settle it, both verified live on 2026-08-19.

**1. `robots.txt` is a blanket disallow.** Fetched
`https://understat.com/robots.txt` → HTTP 200, contents in full:

```
User-agent: *
Disallow: /
```

There is no narrower reading available. The entire site is disallowed to every
automated agent — unlike FBref, where the restrictive paths were commented out.
This is not a contract, but it is an unambiguous statement of non-consent to
automated collection, and GBM would be crawling against it knowingly.

**2. The data is too narrow to carry the requirement, even setting that aside.**
Fetched `https://understat.com/` → HTTP 200. Site title: *"xG stats for teams
and players from the TOP European leagues"*. Coverage is exactly six top-flight
competitions — **EPL, La Liga, Bundesliga, Serie A, Ligue 1, RFPL** — from 2014
to the current season. The `JSON.parse` embedded-payload pattern is present and
CSV/JSON/XLSX export hooks exist on the page.

| Category | Present |
|---|---|
| Shots with xG, xA, xGChain, xGBuildup | Yes |
| Goals, assists, minutes, position | Yes |
| Defensive actions, duels, tackles, interceptions | **No** |
| Progressive passes / carries | **No** |
| Aerial duels | **No** |
| Positional percentiles / per-90 benchmarks | **No** |

**Why that is disqualifying for GBM specifically:** six top-flight European
leagues is the *most* covered population in world football and the least in need
of discovery. GBM's edge is players below that level. And xG/xA alone cannot
support position-specific evaluation — a ball-playing centre-back and a
defensive midfielder are separated by progressive passing, duel success and
defensive volume, none of which Understat carries. It is a shot-quality source,
not a scouting source.

**Verdict:** do not build an adapter. `UNDERSTAT` stays in `ProviderCode` and
Reep's `key_understat` remains useful as a manual deep link for a scout looking
at an elite player's shot profile. It is not a substitute for a licensed feed,
and it does not change the conclusion below.

---

## BeSoccer — INVESTIGATE (request a Level 3 trial and quote)

**The first candidate that is structurally different from the rest.** Every
other source failed because a rights-holder refuses to let data downstream.
BeSoccer *is* a rights-holder selling licences. Its blocker is an unanswered
question, not a closed door.

It is also solving a different problem. BeSoccer carries **no advanced metrics
at all** — no xG, xA, duels or progressive actions (the endpoint labelled
"Advanced equipment statistics" returns basic counts; the name is a translation
artifact). It does not replace Wyscout. What it offers is depth in the long
tail, which is where GBM's representation thesis actually lives.

### Lower-division depth — the strongest finding, verified

Parsed from `api.besoccer.com/en/content/eu` and `/am` (both HTTP 200).

**Spain reaches roughly tiers 6–8** — below where the Transfermarkt dataset
stops. Beyond LaLiga / Segunda / Primera RFEF / Segunda RFEF / Tercera RFEF it
descends to Primera Andaluza, **Segunda Andaluza broken out per province**
(Sevilla, Cádiz, Málaga, Córdoba, Granada, Jaén, Huelva, Almería), Tercera
Andaluza, Primera/Tercera Catalana, Preferente and Primera Autonómica Madrid,
plus regional divisions for Murcia, Cantabria, Aragón, Navarra, La Rioja,
Baleares, Canarias, Castilla y León, Castilla-La Mancha and Extremadura.

**Latin America.** Argentina: Primera Nacional, Primera B Metro, Primera C,
Torneo Regional Federal Amateur, Reserve League, **Divisiones Inferiores**.
Brazil: Série A–D, 27+ state championships, U20 and U17 national and state
competitions. Chile down to Tercera A; Colombia Primera B; plus Bolivia, Costa
Rica and the Caribbean.

**Youth: treat the headline number with suspicion.** 285 youth-labelled European
competitions, but a large share are **futsal** (Cadete Futsal, province by
province). Genuine 11-a-side: División de Honor, Copa del Rey Juvenil, regional
Juvenil leagues, UEFA Youth League, Premier League 2 U21, FA Youth Cup. Do not
quote "285 youth competitions" externally.

### Genuinely additive to what GBM already holds

- **Contract dates verified populated** — `contract_start` / `contract_end` on
  `req=player`. Not in the Transfermarkt dataset.
- **Injuries** — start, end, type, body-part group, expected return. Also absent
  from Transfermarkt.

### The test that decides whether this is worth buying

The `bs_agent` field exists in the schema but was **null** in the sampled
response, while the public website does display agents. So BeSoccer holds the
data; whether the API populates it at scale is unproven.

> **Run that test on lower-division Spanish players, not on a famous one.**
> Every provider knows a Barcelona goalkeeper's agent. Nobody knows a Segunda
> Andaluza player's — and that gap is the entire representation thesis. If
> `bs_agent` is populated in the long tail, BeSoccer is worth paying for on that
> basis alone.

### Commercial position — unresolved, ask in one email

- **Pricing: quote-only.** `api.besoccer.com/en/budgets` (HTTP 200) states
  verbatim *"We do not have free accounts."* No figures published. Price scales
  with **competition selection**, which matters: GBM wants the long tail, which
  may price very differently from the top-5 leagues.
- **Rate limits: UNVERIFIED.** The full 9.67 MB Postman collection (116
  requests, 58 operations) contains no rate-limit, quota or 429 language at all
  — only a per-endpoint cache TTL of 600 seconds.
- **Storage rights: UNVERIFIED and this is the decision blocker.** The API
  contract is not published — `/en/terms`, `/en/legal`, `/en/conditions`,
  `/es/aviso-legal` and four others all 404. Terms arrive with the quote. The
  *website* legal notice forbids reproduction, but that governs scraping, not
  the API licence.

> Sharp edge: `source_records` retains raw payloads by design. A licence drafted
> for a live-scores media customer may forbid exactly that. **Ask for storage
> rights, price and the tier list in the same email — do not build first.**

- **Tiering:** Level 3 (19 endpoints) is required for everything GBM wants —
  player detail, injuries, career trajectory, market values.
- **Coverage window caveat:** the collection states *"current season + 2 previous
  years"*, yet `player_seasons` returned 2001–2023 and `player_trajectory` a full
  2009–2022 career. Likely the window binds `year=`-scoped match queries while
  career aggregates are unrestricted — **inference, not verification.** Settle it
  in the trial; it materially changes the value.

### Limits to plan around

- **No player search endpoint.** The single `q` parameter filters competitions,
  not players. BeSoccer can therefore never be an entry point for a player Reep
  has no id for — it can only enrich players GBM can already identify.
- Worth measuring before spending: what fraction of Reep rows actually carry
  `key_besoccer`. Likely thinnest in exactly the lower divisions GBM wants.

### Adapter cost: M

Transport is trivial — one PHP endpoint, `key=` query param, `req=` switch. The
cost is normalisation: everything is strings; enums are coded with no legend
(`foot:"1"`, `role:"2"`); values are Spanish on `/en` endpoints ("Traspaso",
"Libre", "Renovación"); keys are typo'd (`seasson`, `shedule`); and
**`real_value` is in millions on one endpoint and euros on another** — a silent
10⁶ error waiting to happen. That one belongs in the adapter's tests on day one.

---

## SportDB — AVOID (dead end)

Settles GBM's earlier "promising but unverified" note. It is online but it is a
paid key in front of a free MIT-licensed scraper.

Pulled the live spec at `api.sportdb.dev/api/openapi.json` (HTTP 200): 49 paths,
of which exactly **two** serve football — `GET /api/flashscore/{full_path}` and
`GET /api/transfermarkt/{full_path}`, both untyped passthroughs with an empty
response schema. The other 47 are unmodified `tiangolo/full-stack-fastapi-template`
boilerplate (`/api/items/`, `/api/login/access-token`) plus billing and admin.

**Every endpoint advertised on its own homepage returns 404** — player search,
player profile, transfers, club search, live football. A deliberate nonsense
route also returned 404 while `/api/transfermarkt/anything` returned 401, which
proves 404 means "no route registered" rather than an auth gate. The published
documentation omits the required `/transfermarkt/` prefix, so as written it is
unusable and nobody has noticed.

The advertised Transfermarkt route table exactly matches **`felipeall/transfermarkt-api`**
— MIT, free, self-hostable — which exposes *more* than SportDB sells (market
value, injuries, achievements).

Disqualifying beyond the redundancy:

- ToS §7 pushes third-party compliance onto the customer: *"You are responsible
  for ensuring that your downstream use of data complies with applicable
  third-party terms."* Paying does not launder the Transfermarkt/Flashscore
  scraping risk.
- **No named legal entity** anywhere on the site, ToS or privacy policy. §10
  governs by *"the jurisdiction of our principal place of business"* — never
  stated. There is no counterparty to contract with.
- Free tier contradicts itself: homepage says 1,000 free requests, ToS §3 says
  100. No published prices.

Drop it from the roadmap.

*UNVERIFIED: no response body was ever seen — every data route is key-gated — so
its actual data quality is untested. The `felipeall` attribution is a strong
inference from an exact route-table match, not a disclosure.*

---

## Wikidata — ADOPT LATER, narrowly (Reep already extracted it)

Measured rather than described: SPARQL counts over `wdt:P106 wd:Q937857` against
`query.wikidata.org/sparql`, compared with computed fill rates over Reep v0's
`people.csv`.

| Field | Wikidata (390,150 footballers) | Reep v0 (401,061 players) |
|---|---|---|
| Date of birth | 92.9% | **93.0%** |
| Nationality | 87.8% | 84.8% |
| Position | 73.8% | 72.0% |
| Transfermarkt id | 53.0% | **51.8%** |
| Height | 23.8% | 19.5% |

Within 1–4 points on every field, and Reep's CSV already carries
`date_of_birth, nationality, position, position_detail, height_cm` alongside 40+
provider keys. **Querying Wikidata directly re-derives what GBM can already read
from one file.**

On the long tail specifically — the population that motivated the question —
Wikidata is *thinner* than Reep, not richer: 11,643 footballers born 2005 or
later (3.0% of the total), against 13,779 in Reep. Roughly 15,000 Reep players
were sourced outside Wikidata entirely. For scale, GBM's Transfermarkt dataset
already holds 22,292 players active in 2025. Wikidata will not surface a player
GBM does not already know about. A spot-check of ten players born 2007+ returned
height on 0/10 and club on 1/10, and contained two live data faults (one player
with two conflicting dates of birth, one duplicated across citizenships).

Wikidata has no property for market value, contract, agent or match statistics.

**The one genuine gap it fills:** club history (P54) with dated spells, 67.2% of
players — a column Reep's `people.csv` does not have. But Transfermarkt gives
GBM better career data, so this matters only for the ~48% with no Transfermarkt
id. CC0, free, no auth. Not worth an adapter yet.

---

## URGENT: GBM is pinned to a frozen Reep register

Found while assessing Wikidata, and it outweighs both sources in that brief.

`services/ingestion/src/reep/resolve.ts` downloads the v0 register from
`raw.githubusercontent.com/withqwerty/reep/main/data`. **That register is
frozen.** Verified directly from the repository README this session:

> *"This repository is the frozen v0 register … The data files are frozen too,
> not just the API. The last CSV release was 2026.25 (21 June 2026) … New
> integrations should start from the v1 surfaces above."*

**A free successor exists and is live.** Verified at `reep.football/downloads`
(HTTP 200): release **`20260812T142301Z`, 12 August 2026** — one week old —
carrying **1,703,816 entities against v0's 444,707**. CC0, no registration, no
payment, CSV and DuckDB.

That is roughly **3.8× the entity coverage**, and the gap matters most exactly
where GBM is weakest: lower divisions and youth, where v0 was always thinnest.

**Migration is real but survivable.** The README warns v0 `reep_...` ids are *not*
interchangeable with v1 ids. GBM is well placed for this because it never keyed
on `reep_id` — Reep output lands in `player_external_ids` as one provider row
among many, exactly as the canonical-identity rule intended. The work is a new
namespace and a re-resolve, not a schema change.

> **This is the highest-value free action available to GBM right now**, and it
> costs nothing but the migration. It is worth more than every source assessed
> in this document except a Wyscout licence.

---

## API-Football — ADOPT ($19/month, Pro tier)

A different layer from Wyscout, not a substitute for it. Buy it anyway: it fills
holes GBM has today with no alternative, at a price that does not require a
decision meeting.

**Pricing** (read via headless browser after Cloudflare 403'd a plain fetch;
HTTP 200, `api-football.com/pricing`, footer © 2026):

| Plan | Price | Quota |
|---|---|---|
| Free | $0 | 100 requests/day |
| **Pro** | **$19/mo** | **7,500 requests/day** |
| Ultra | $29/mo | 75,000 requests/day |
| Mega | $39/mo | 150,000 requests/day |

Verbatim: *"All our plans include all competitions and endpoints."* **No
per-league gating on any tier** — the price buys throughput, not access. Buy
direct rather than via RapidAPI: prepaid, no auto-renewal, and overage is
impossible (hitting quota suspends for the day, it never bills).

> Two traps: *"Plan upgrades are final and it is not possible to downgrade"* — so
> start on Pro, not Ultra. And a per-minute rate limit exists
> (`X-RateLimit-Limit` is in the OpenAPI spec) but its per-plan value is
> **UNVERIFIED**, published nowhere.

**Coverage: 1,239 competitions, of which 562 carry player season statistics** and
122 carry per-fixture player statistics. Genuine youth and reserve depth —
Campionato Primavera 1 & 2, U19 Bundesliga, U18 Premier League, FA Youth Cup,
Professional Development League, Liga Revelação U23, Brasileiro U17/U20 plus ~20
Brazilian state U20s, São Paulo Youth Cup, Dutch U18/U19/U21, reserve leagues,
and the full international youth ladder. Second and third tiers throughout
(Regionalliga, Serie D, Oberliga, National League, Segunda). Depth is uneven —
Primavera 1 has lineups and standings but no player stats.

**Storage rights: permitted by omission.** The full ToS contains no storage,
caching or persistence prohibition. The only data restriction is resale. The
caveat is about *publication*, not storage:

> *"We do not provide a 'license' for the use and publication of the data … Any
> license or permission to publish the data must be requested by the user from
> the competent authorities."*

GBM is auth-gated with no public surface, so internal storage, internal display
and derived analytics are clean. **Record the flag:** that disclaimer becomes
live the day GBM shows this data to a client or a player. Neither vendor grants
rights over league or federation IP.

**What it does not have:** no xG anywhere; zero documentation hits for market
value, contract or agent; no progressive actions, no positional data, no per-90s
or percentiles served. Its transfers are unusable as fees — `type` is free text
(observed `Free`, `N/A`) with no amount or currency, so GBM's 175,165 structured
Transfermarkt transfers are strictly better.

**Why buy it regardless:** `player_season_stats` and `matches` are both **0 rows**
today with no free path to filling them, and it brings injury and suspension
*histories* with real start and end dates that nothing GBM holds provides.
Refreshing all 13,260 resolvable active players costs 13,260 calls — about two
days on Pro.

> GBM *can* derive per-90s and even percentiles from this, because it gets the
> entire league population ungated and a cohort is exactly what a percentile
> needs. What it cannot derive at any effort is xG, progressive actions or
> anything positional.

---

## SportMonks — AVOID at every published tier

Better licensing language than API-Football, beaten decisively on everything else.

| Plan | Monthly | Leagues |
|---|---|---|
| Starter | €29 | any 5 |
| Growth | €99 | any 30 |
| Pro | €249 | any 120 |
| Enterprise | custom | all 2,300+ |

Storage is **explicitly** granted in writing, which is worth recording as the
best-drafted term found in this round: *"distribution, transfer, and storage of
data provided by our services is allowed"*, and *"if you use our data to create
something based on our data and start earning money from your creation,
everything is fine."* Licensing is per-domain.

**But the coverage headline is inverted.** 2,318 leagues listed, yet only **217
carry basic player stats and 91 carry detailed player stats** — then metered, so
Starter unlocks 5 of those 217. API-Football hands over all 562 player-stat
competitions at $19. SportMonks costs €249 to reach 120.

**The disqualifier is identity.** Measured by joining the Reep v0 register
against GBM's actual `data/players.csv`:

| Provider | Reep register-wide | GBM all (50,149) | **GBM active 2025 (22,292)** |
|---|---:|---:|---:|
| IMPECT | 56,946 | 29,988 (59.8%) | **71.4%** |
| **Wyscout** | 47,201 | 26,876 (53.6%) | **63.7%** |
| API-Football | 36,177 | 21,803 (43.5%) | **59.5%** |
| **SportMonks** | 571 | 565 (1.1%) | **2.5%** |

"Identity is largely solved" holds for Wyscout and API-Football. It is **false**
for SportMonks — 559 players. Adopting it would require fuzzy name+DOB matching,
which contradicts the confidence-1.000 discipline `pnpm reep:resolve` is built
on. Revisit only at Enterprise, and only once a fuzzy resolver exists.

*Also largely redundant: SportMonks' one genuine edge over API-Football is squad
contract start/end dates, but GBM already holds Transfermarkt contract expiry for
17,221 of 22,292 active players (77.3%) and agent names for 26,853.*

### Does either replace Wyscout? No.

Neither serves per-90s or positional percentiles. Neither carries a single
advanced metric — API-Football has no xG at all; SportMonks sells xG as a €24/mo
add-on across just 91 leagues. Neither has progressive passes or carries, touches
in box, or event-level positional data.

And identity gives no reason to prefer the cheap option: **Wyscout resolves to a
higher share of GBM's active squad (63.7%) than API-Football (59.5%).**

*Wyscout's own commercials were not priced this session — UNVERIFIED — but the
substitution question does not need its price, because both alternatives fail on
capability first.*

---

## Youth, federation and academy sources — see `YOUTH_AND_MINORS.md`

Assessed and documented separately, because the constraint there is **statutory
and regulatory rather than contractual** and engineers need to consult it
independently of provider selection.

Headline: **Wikipedia/Wikidata youth tournament squads are the single cleanest
source in this entire research** — CC BY-SA, machine-parseable, no terms-of-service
conflict at all, and the only practical route into African, South American and
Asian youth football. The Premier League's Pulselive API is open and also carries
`altIds.opta`, a free cross-provider join key. UEFA's feed is technically trivial
but needs a licence conversation first.

National federation websites, club academy pages and individual tournament sites
are **not worth pursuing** — all assessed, none carry structured squad data, and
Wikipedia already aggregates the same federation press releases.

Critically: `data/transfermarkt/competitions.csv.gz` holds **65 competitions and
zero youth competitions**. GBM's existing pipeline can never surface a youth
player. There is nothing to extend.

The regulatory position — The FA's Regulation 5.1 bars any approach to a minor
before 1 September of the academic year they turn 16, which means a pipeline
scoring 14-year-olds processes data for a purpose GBM cannot lawfully act on, and
so fails the necessity limb of Art 6(1)(f) before balancing is even reached — is
set out in full, with the platform safeguards it implies, in
[`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md).

---

## Where this leaves GBM

Nine sources assessed. The conclusion is not that GBM chose badly — it is that
the free tier structurally cannot supply advanced metrics, and that GBM's real
edge lies somewhere none of the big providers sell well.

### Buy now

**API-Football Pro — $19/month.** Independent of every other decision here. It
fills `player_season_stats` and `matches`, both currently **0 rows** with no free
path, and brings injury and suspension histories nothing else provides. All
competitions on every tier; only throughput is metered. Start on Pro — downgrades
are contractually forbidden.

### Do first, costs nothing

**Migrate off the frozen Reep v0 register.** `resolve.ts` points at data frozen
since 21 June. Reep v1 is live, CC0, free, and carries **1,703,816 entities
against v0's 444,707** — roughly 3.8× the coverage, with the gap widest in the
lower divisions and youth where GBM is weakest. This is the highest-value free
action available.

### Price it

**Wyscout, for advanced metrics.** Confirmed as the only candidate that serves
the thing GBM actually needs — per-90s and positional percentiles served rather
than derived, across 500+ competitions including lower tiers and youth. The
adapter already exists, Reep already carries `key_wyscout`, and it resolves to a
**higher** share of GBM's active squad (63.7%) than API-Football (59.5%). Neither
commercial alternative substitutes for it: neither has a single advanced metric.

**BeSoccer, for long-tail representation data.** Ask for storage rights, price and
the tier list in one email. Reaches Spanish tiers 6–8 and Argentine and Brazilian
lower divisions that Transfermarkt does not, plus contract dates and injuries.
Test `bs_agent` on a Segunda Andaluza player, not a famous one — that single test
is the representation thesis.

### Build

**Wikipedia youth squads.** CC BY-SA, no ToS conflict, and the only route into
the youth football that the commercial providers do not cover. See
[`YOUTH_AND_MINORS.md`](YOUTH_AND_MINORS.md) before writing any of it.

### Closed — do not revisit

Sofascore, FotMob, FBref, Understat, SportDB, SportMonks. The first three are
closed by market structure rather than by price, so no further free-source
research will change the answer.

### Still requiring a human

1. **Read `LICENSE.pdf` in `statsbomb/open-data`** and rule on commercial use.
   That one document decides whether the research-corpus play is available.
2. **Get a Wyscout quote.** No other decision here can be made well without the
   number.
3. **Read UEFA's General Terms** before touching their youth feed, and The FA's
   minors authorisation requirements before any approach.
