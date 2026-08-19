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

## Outstanding

Still under investigation as of this revision. Absence here means not yet
assessed — not assessed and dismissed.

| Source | Question being answered |
|---|---|
| API-Football / SportMonks | Real pricing, and whether the licence permits storing data in GBM's own database |
| SportDB / Wikidata | Whether SportDB is real or a dead end; Wikidata's marginal value over Reep |
| Youth, federation and academy sources | Where GBM's actual edge is — plus the GDPR position on data about minors |

---

## Where this leaves GBM

The free tier is closed for advanced metrics. That converts an engineering
question into a commercial one, and GBM is closer to an answer than it looks:

**A Wyscout adapter already exists** — 782 lines in
`packages/providers/src/wyscout/`, written against the real OpenAPI v3 spec,
currently unconfigured. Wyscout is purpose-built for this problem: 500+
competitions including the lower tiers and youth football GBM actually recruits
from, the full advanced metric set, and per-90s and positional percentiles
*served* rather than derived. Reep already carries `key_wyscout`, so identity is
solved. The blocker is price, not engineering — and price is a blocker an
agency can clear.

Peers if Wyscout does not land: StatsBomb/Hudl commercial API (same schema as
the open data, current coverage, and the reducer would already be written),
Impect, SkillCorner.

### Two cheap next steps

1. **Have a human read `LICENSE.pdf` in `statsbomb/open-data`** and rule on
   commercial use. That single document decides whether the research-corpus
   play is available.
2. **Get a Wyscout quote.** The adapter exists; no other decision in this
   document can be made well without knowing the number.
