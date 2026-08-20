# GBM brand analysis

**Analysed 2026-08-20** from the GBM Sports Group folder in the owner's Google
Drive (logo, representation agreements in EN/FR/GE, client materials). Client
names and contract terms deliberately stay out of this repository; what
follows is the brand identity and its consequences for the product.

## Assets found and adopted

| Asset | Where | Adopted as |
|---|---|---|
| `Logo.png` — white **GBM SPORTS GROUP** wordmark on black, 225×225, monochrome | Drive → committed to `apps/web/public/brand/gbm-logo.png` | Sidebar and login mark |
| Tagline — **"Elevating Careers · Building Legacies"** | Representation agreements (title pages) | Login screen, agency surfaces |
| Founder identity — Mame Amirov, FIFA Football Agent Licence No. 202307-2910 | Agreements | Agency profile layer |
| Brand voice — *"Trust before contract"*; plain language; player-first; "a selective European football agency"; "careers over years, not months"; every fee disclosed | Agreements (founder's note, plain-language summary) | The product's copy register |
| Client book | Signed agreements for a small roster — predominantly **Georgian youth players plus a Senegalese prospect**, with youth editions in Georgian and French | Grounds the platform's target market; names stay in Drive, not in Git |

No photography style guide, colour specification or typography specification
exists — the wordmark and the agreements are the whole visual record. The
logo master is a 225px raster; request a vector master from its designer
before any print use (at ≤48px UI sizes the PNG is clean).

## Colour palette

The brand is **monochrome** — white on black, nothing else. That is a
strength, and the product should keep it that way:

- **Brand chrome stays monochrome.** Ink `#0F1419` / chalk `#EDF0EE`
  surfaces (already the app's tokens) are the brand palette, near-black and
  paper-white with warmth. The wordmark sits on ink.
- **Colour carries data meaning only** — the app's existing semantic system
  (teal `#0B6B62` = corroborated, ochre `#B06E1F` = single-source, brick
  `#A8321F` = sources disagree) stays the *only* colour in the product.
  This is both good information design and exactly the agreement's ethos:
  colour as disclosure, never decoration.

## Typography

Current app stack — **Archivo** (display/body) + **IBM Plex Mono** (data) —
is kept: the wordmark's geometric grotesk sits naturally beside Archivo's
bold weights, and the mono-for-numbers rule is what makes dense scouting
tables readable. No change recommended.

## Visual direction: quiet authority

The agreements read like a firm that wins trust by showing its working —
no-automatic-renewal in bold, fees explained, a founder's note before the
clauses. The platform's design language should be the same posture in
software, and mostly already is:

1. **The teamsheet, not the dashboard.** Dense, calm rows; tabular
   numerals; no decorative cards, no animation. (Existing direction —
   keep.)
2. **Provenance is the ornament.** The source-stripe (ticks per provider
   under a fact) is the product's signature element — the visual form of
   "every fee disclosed". Extend it, never hide it.
3. **Honesty states are designed, not apologised for.** Missing data reads
   as a designed "not recorded by any connected source" line, never a blank
   or a fake. `NO_AGENCY_LISTED` keeps its warning treatment everywhere.
4. **The wordmark replaces the text logo** in the sidebar and login, on
   ink, at small size — never stretched, never colourised.
5. **The tagline appears once** — on the login screen — not repeated
   through the app. Selectivity is the brand.

## Where the brand and the data meet

GBM's real book is Georgian and African youth. The imported dataset does not
yet reach their domestic leagues (see `STAGED_DATA_VALIDATION.md` §4.3) —
so the platform's most brand-relevant population arrives with the youth and
lower-league sources on the roadmap, not with more of the same import. The
agency layer (represented players, official links) is designed so those
players can be entered and tracked first-class the moment they exist in the
database.
