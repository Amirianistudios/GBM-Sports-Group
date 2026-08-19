# Youth data and under-18s

Youth football is the one area where GBM could hold something no provider sells,
and the one area where the legal constraint is **statutory and regulatory rather
than contractual**. Everywhere else in this research the blocker was somebody's
terms of service. Here it is the law and The FA's own rules, which do not
negotiate.

Read this before writing any code that ingests a player under 18.

> Verified 2026-08-19. Anything not confirmed against a primary source this
> session is labelled UNVERIFIED.

---

## The argument that decides everything

Most analyses of this reach for a proportionality argument under GDPR. There is
a stronger and much cleaner one, and it starts with a football regulation rather
than a data-protection one.

**The FA Football Agent Regulations, Section 19, Regulation 5.1** (6 August 2025
edition, read from the primary PDF):

> *"An Approach to a Minor or their legal guardian in relation to any Football
> Agent Services or Other Services shall not be made before 1 September in the
> Academic Year in which the Minor reaches the age of 16. Subject to the
> foregoing, such an Approach to a Minor may only be made once prior written
> consent has been obtained from the Minor's legal guardian."*

From which:

1. GBM **cannot lawfully approach a 14-year-old.**
2. A pipeline that identifies, scores and queues 14-year-olds for representation
   is therefore processing their personal data **for a purpose GBM cannot act
   on.**
3. Processing that is not necessary for a purpose the controller may lawfully
   pursue **fails the necessity limb of Article 6(1)(f)** — before the balancing
   test is reached at all.

This is stronger than arguing proportionality, and it hands the platform a
bright-line age gate tied to a rule the business must already obey.

Related, both from the same regulations: Reg 5.2 bars entering any agreement with
a Minor on the same timeline; Reg 5.7 makes a Representation Agreement with a
Minor enforceable only if signed by both the Minor and their legal guardian;
Regs 5.4–5.5 require separate FA authorisation to deal with Minors, including a
DBS check obtained specifically for this purpose (one obtained for coaching or
welfare *"will not be accepted"*) and a CPD course valid three years; Reg 7.10
bars any service fee relating to a Minor unless they enter a professional
contract that comes into force.

*UNVERIFIED (search-derived): FIFA's FFAR reportedly frames this as a six-month
window before eligibility to sign a first professional contract, and RSTP Art 19
bars international transfer of under-18s save narrow exceptions. Confirm from the
FIFA PDFs before relying on either. The practical consequence if correct: a
15-year-old in Senegal is neither signable nor approachable — commercial value
near zero, liability not.*

## One thing to get right in both directions

**The ICO Children's Code does not apply to GBM Intelligence.** It binds
"information society services likely to be accessed by children". GBM is an
authenticated private B2B tool — `src/proxy.ts` authenticates every route and
there is no public surface. Children will not access it, so the 15 standards are
not directly engaged.

UK GDPR applies in full, and that is the standard to design to. Recital 38:
children *"merit specific protection"*. Do not let anyone invoke the Children's
Code as either an extra burden or an excuse.

---

## What GBM may collect

| Age | Position |
|---|---|
| **18+** | Ordinary business processing. Age computed from source date of birth — mechanical. |
| **16–17** | Permissible under legitimate interests **with a completed DPIA and a published privacy notice**: name, date of birth, nationality, club, position, shirt number; competition and match participation, minutes, goals, assists, cards; provider ids and provenance; scout observations recorded as football assessment. Necessity is satisfiable here because a lawful route to an Approach exists from 1 September of the academic year they turn 16. |
| **Under 16** | Do not ingest. Identity and match participation only if a specific purpose can be articulated — and it usually cannot. **Do not build this path in v1.** |

## What GBM must never collect for anyone under 18

- **Contact details of any kind** — phone, email, social handles, messaging ids.
- **Guardian, parent or family details**, including guardian contact.
- **School, home address**, or anything locating the child beyond club and country.
- **Health and injury data.** Article 9 special category. Legitimate interests is
  **not available** for Art 9, and no Art 9(2) condition fits a scouting agency.
  `getInjuries` must be hard-disabled for under-18s **at the provider layer**, not
  filtered at the view layer.
- **Photographs at scale.** Store a URL if a source gives one; never mirror the
  image. A systematically assembled photo library of identified children carries
  serious breach consequences for no scouting benefit that date of birth and
  match statistics do not already provide.
- **Anything derived from social media accounts.**

> If someone asks for contact data *"so we can reach out"* — that request **is**
> the Approach that Regulation 5.1 prohibits.

---

## Platform safeguards

These are engineering requirements, not policy aspirations. Several land directly
on code that already exists.

### Ingestion

- **Age gate in the provider layer, before anything persists.** Compute age from
  the source date of birth and route or reject there. Do not rely on a downstream
  filter — the defect log in `CURRENT_STATE.md` is a list of things that were
  invisible until executed.
- **Field allowlist for minors, never a blocklist.** `ProviderPlayerSeasonStats.advanced`
  is typed `Record<string, unknown>` and `Provenance.raw` is `unknown`. Both will
  carry whatever a provider sends straight into `source_records`, which is
  designed to retain payloads **permanently**. A new upstream field must be
  explicitly admitted before it can reach storage. This is the most likely silent
  compliance failure in the current design.
- **Add `handlesMinors` to `ProviderCapabilities`**, so a provider declares it up
  front. Consistent with the contract's existing rule that capability is
  declared, not discovered by failing.

### Storage and access

- Under-18 records in their **own table or tagged partition**, with their own RLS
  policy and a narrower grant than adult tables.
- **Audit reads, not just writes**, on minor records — who viewed which child and
  when. The cheapest control that demonstrates Art 5(2) accountability.
- **Suppress under-18s by default** from `v_representation_opportunities` and
  `discovery_signals`.

> Specifically: `UNREPRESENTED_HIGH_POTENTIAL` firing on a 15-year-old is
> automated profiling of a child in service of an approach GBM cannot lawfully
> make — and GBM's own rule that `NO_AGENCY_LISTED` ≠ unrepresented compounds it,
> because the platform would be queueing a child for contact on the basis of a
> fact it explicitly documents as not meaning what it appears to mean. **Gate
> that signal type at 16.**

- **Recompute age daily.** Crossing 18 changes the regime and must happen
  automatically.

> Worth stating plainly: five views without `security_invoker` recently exposed
> every player's name, date of birth, valuation and agency status to `anon` over
> the public internet. That was 30 adult sample players. The same defect over a
> youth table is a personal-data breach involving children — Art 33 notification
> to the ICO within 72 hours and, on that risk profile, likely Art 34
> notification to the data subjects. It is fixed. The point is that it happened,
> and youth data raises the cost of the next one by an order of magnitude.

### Governance

- **DPIA before first youth ingestion**, not after. Art 35(3)(a) and the ICO's own
  list make it mandatory — systematic profiling, children's data, large scale.
  Doing it first is also the cheapest way to force the field-allowlist decisions.
- **Article 14 transparency.** GBM collects from third parties rather than from
  the child, so Art 14 applies and requires informing within one month. The
  Art 14(5)(b) "disproportionate effort" exemption is narrow and conditions
  relief on publishing the information instead. In practice: a public,
  plain-language privacy notice at a stable URL, plus a working objection and
  erasure route. **GBM currently has no public surface at all**, so this needs a
  deliberate exception — without it, GBM is in default breach of Art 14 from the
  first ingested record.
- **Art 21(1) objection** is absolute in practice against legitimate-interests
  processing unless GBM can show compelling grounds overriding a child's
  interests. It will not be able to. Build the erasure path.
- ROPA entry, defined retention (suggested: purge any under-18 record untouched by
  a scout within 24 months), named owner.
- Register the FA additional authorisation to deal with Minors, the DBS check and
  the minors CPD for whoever will actually make approaches. A business
  prerequisite rather than a data question — but it determines whether the
  pipeline has any lawful endpoint at all.

---

## Sources worth building

### 1. Wikipedia / Wikidata youth tournament squads — build this first

Per-tournament squad pages (2026 U-17 AFCON, 2026 AFC U-17 Asian Cup, 2026 South
American U-17 Championship, and U-20 equivalents) carrying name, position, club,
shirt number and date of birth as machine-parseable `{{nat fs player}}` templates.
One parser covers every tournament and every year.

```
https://en.wikipedia.org/w/api.php?action=parse&page=<title>&prop=wikitext&format=json&formatversion=2
```

Verified: HTTP 200, 63,852 bytes, 16 team sections, 384 player rows. Populated
within days of announcement — the AFCON page cites federation releases dated
3 May 2026.

**Licence: CC BY-SA.** This is the only source in the entire research with **no
terms-of-service conflict whatsoever**, and it is the answer to the problem that
closed every commercial aggregator: the licence affirmatively grants what UEFA,
FIFA and Sofascore contractually deny. It is also the only practical route into
African, South American and Asian youth football — exactly where commercial
providers thin out and GBM's edge would be largest. Effort S–M.

> Measured caveat: of 402 `age=` fields, only 173 are populated — **43% date-of-birth
> coverage** (Egypt's entire squad is blank). Names, positions and clubs are
> near-complete. This hurts entity resolution, but it is also a data-protection
> benefit: **do not backfill missing dates of birth from UEFA merely because you
> can.**

### 2. Premier League (Pulselive) API — U21 now, U18 only behind the minors regime

Open JSON, no auth, `Origin: https://www.premierleague.com`. Covers U18 Premier
League, U18 Professional Development League, U18 and U17 PL Cups, FA Youth Cup,
Premier League 2 and PDL U21. Verified HTTP 200; U18 PL 2025/26 returns 1,806
players, PL2 1,840, with 2026/27 already provisioned. `robots.txt` is permissive.
Effort S.

**Beyond youth, it helps a known gap:** every player carries `altIds.opta` — a free
cross-provider join key, against a codebase where unproven cross-provider identity
is the first entry on the known-gaps list.

> The feed publishes **full names and exact dates of birth for U18 academy
> players** (a sample of 100 returned 94 real names, 74 with exact birth dates).
> Only unnamed trialists appear as placeholders. So it is both more valuable and
> more legally loaded than it first appears.
>
> **Sequence it: PL2 and PDL U21 first** — predominantly 18+, ordinary adult
> processing, immediate value. Add U18 only once the age gate, minors table, RLS,
> read audit, DPIA and public privacy notice actually exist.

*Site terms and conditions were not checked. Do that before building.*

### 3. UEFA Youth League — licence conversation before code

Clean JSON, no auth, no key. Competition 2008 (UYL), 24 (U19 Euro), 23 (U17
Euro). All verified HTTP 200. There is no squad endpoint (`/v2/teams/{id}/squad`
404s), so squads are reconstructed from match lineups. Technically the easiest
adapter in the whole set — effort S.

Ranked third **only** because of the terms. `www.uefa.com` returned 503/403/timeout
on three attempts and the General Terms could not be read from primary source.
*UNVERIFIED, search-derived:* they reportedly bar robots and spiders from scraping
Content, bar using Content to train any software, model or algorithm, and bar
systematic collection to create a database or directory — which is precisely what
an adapter does.

**An open endpoint is not a licence.** Have someone read the actual clause. If it
reads as reported, ask UEFA what a data licence costs. If unavailable, the feed is
still defensible as a *targeted lookup for a player a scout is already assessing*
— a far weaker factual pattern than systematic harvesting. The UYL is U19, so
mostly 18–19 year olds, which keeps most of it outside the minors regime.

---

## Not worth pursuing

**National federation websites.** Four federations, four regions, one answer: no
structured squad data. DFB's `robots.txt` is fully permissive but its U19 page
renders a news feed — squads appear as prose surnames with no dates of birth
("Die deutsche Startelf: Hellstern - Pinto Pedrosa, Schmetgens…"). FFF returns
403 to everything. KNVB was in maintenance mode on both attempts. CBF is a
Next.js SPA serving `noindex`. Each would need a bespoke, brittle, JS-rendering
scraper producing worse output than Wikipedia already aggregates **from the same
federation press releases**. Let Wikipedia do the aggregation.

**Individual club academy pages.** Same argument, worse — one scraper per club, no
stable ids, no shared schema, and club sites rarely publish dates of birth, so
entity resolution is harder than for federations.

**Individual youth tournament sites.** Bespoke per event, annual URL churn, no
shared schema. Wikipedia covers the significant ones for a fraction of the effort.

**Anything about under-16s.** Not technically hard — but FA Reg 5.1 makes the
approach unlawful, RSTP Art 19 makes the transfer near-impossible, and Art 6(1)(f)
necessity therefore fails. There is no lawful business action at the end of the
pipeline.

**Injury or medical data for under-18s.** Article 9, no available basis.

**Contact, guardian, school, address or social data for under-18s.** No lawful
basis, no scouting value beyond statistics and date of birth, catastrophic if
breached.

**Bulk mirroring of player photographs.** Store the URL only.

**Extending the existing Transfermarkt dataset to cover youth.** Verified against
the local file: `data/transfermarkt/competitions.csv.gz` contains **65
competitions and zero youth competitions** — domestic first tiers, cups and
senior national teams only. GBM's existing pipeline will never surface a youth
player. There is nothing to extend, and `openfootball` has no youth dataset
either.

## Also assessed

**FIFA's API** (`api.fifa.com/api/v3`) is open — U-17 World Cup is competition
102, U-20 is 104, with 21 U-17 editions back to 1985. Its match-detail endpoint
returns lineups with player id, name, shirt number and position but **no date of
birth**, which makes it materially *lower* risk than UEFA for the same
competitions: squad membership without the birth date that turns a record into a
precise profile of a named child.

The obstacle is the terms, verified at `inside.fifa.com/en/terms-of-service` §5.3
— Content may not be *"used, reproduced, distributed… or otherwise exploited for
any other purposes than for accessing and using it on the FIFA Digital
Platforms."* A broad bar on GBM's use. Weaker than UEFA's position, but not clean.
