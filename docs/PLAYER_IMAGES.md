# Player imagery — legal position and roadmap

Sprint 1.5 review (2026-08-21). The rule that governs everything here: GBM
displays only imagery a source legitimately provides, hotlinked or licensed —
never scraped from protected sites, never mirrored without a right to copy.

## What the platform uses today

**Player portraits.** The Transfermarkt public dataset ships an `image_url`
per player (98.5% coverage on the imported population), pointing at the
provider's own CDN (`img.a.transfermarkt.technology`). The platform stores
the URL as a fact (provenance intact), hotlinks it through `next/image`
(optimization + resizing, `referrerPolicy="no-referrer"`), and renders an
initials monogram whenever the URL is absent or the CDN declines to serve
it. Nothing is copied to GBM storage.

**Club badges.** The dataset's `clubs` table carries **no badge or logo
field** (verified against `clubs.csv` columns, 2026-08-21). Constructing
badge URLs against the provider's asset host by guessing paths would be
scraping in all but name, so the platform shows no club badges today.
Club identity stays textual.

## Wikidata was tried for the GBM portfolio, and does not hold it (2026-08-23)

Roadmap item 1 below was executed against the fifteen portfolio players rather
than left as a plan. The result is worth recording so it is not attempted again
in the belief that it is untried.

The `wikidata.org` API rejects this environment's shared egress with HTTP 429
regardless of user agent, but the SPARQL endpoint at `query.wikidata.org`
answers normally, so the lookup ran there via the `mwapi` EntitySearch service.

**Three of fourteen names resolve to a Wikidata item, and none of the three has
an image** (`P18` absent on all). Two of the three are the players the platform
already holds, and the one new item — Tornike Dzotsenidze, Q128799060 — carries
a date of birth at **precision 9, meaning year only**. Its `1999-01-01` is a
placeholder for "born 1999", not a birthday, so it was **not** imported: the
column is a date, and storing it would have invented a day and a month for a
real person.

The conclusion is not that the route is wrong but that this portfolio is not in
it. These are youth and lower-league players in Belgium and Georgia; public
reference data does not cover them, and no licensed provider the platform could
buy would either. **GBM itself is the only source that holds their photographs
and their details**, which is why the answer was to build the editing surface
(`/players/[id]/edit`) rather than to keep looking for a feed. The portrait and
hero URL fields there accept an https link to imagery GBM has the right to use,
and every portfolio card now states how many of its fields are still empty.

## The roadmap, in order of preference

1. **Wikidata / Wikimedia Commons** (Sprint 2 candidate). Wikidata entities
   for clubs and players link Commons images with explicit licences
   (typically CC BY-SA / public domain). Correct usage: resolve via the
   Wikidata API (players are already Reep-resolvable; clubs match by name +
   country), store the Commons file URL and its licence + attribution as
   facts, and render attribution where required. This is the legitimate
   route to club badges (many are PD-ineligible logos or freely licensed)
   and to action photography for a subset of players.
2. **Official club media.** Some clubs publish press kits with usable
   imagery; usable only club-by-club with recorded permission. Not
   automatable; suitable for GBM portfolio players specifically.
3. **Licensed APIs** (when budget justifies): API-Football and SportMonks
   plans include club logos and player photos licensed for product display;
   Getty/Imago for editorial action photography of priority players.

## What the platform will not do

- No scraping of protected websites (Transfermarkt pages, club sites).
- No guessed asset-host URLs for content the dataset does not provide.
- No AI-generated or composite player likenesses, ever — a scout must be
  able to trust that a face is the player.
