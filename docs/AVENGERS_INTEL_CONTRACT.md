# External intelligence contract — Avengers on Grok Bot

The integration specification for an external AI scouting team feeding
structured football intelligence into GBM Intelligence. Written to be handed to
that team as-is.

```
Avengers on Grok Bot
        │  gbm_intel_submit()          ← the only door
        ▼
   SUPABASE  (source of truth)
        │  RLS-scoped reads
        ▼
   GBM platform (Next.js on Vercel)
```

The team never touches the frontend, never receives a database password, and
never gains read access to GBM's portfolio. It calls two functions.

---

## 1. What already has a home

Most of what a scouting department produces is already modelled. Submitting it
means writing into the existing tables *with provenance*, not inventing a
parallel schema — otherwise the platform ends up with two versions of a
player's career and no way to say which is real.

| Intelligence | Where it lands | Submit as |
|---|---|---|
| Age, nationality, position, club, career, contract, market value, agent | `players`, `contracts`, `market_values`, `transfers`, `player_team_history`, `representation_records` | `FACT` |
| Appearances, minutes, goals, assists, xG, xA, shots, key passes, progressive passes/carries, dribbles, duels, aerial duels, tackles, interceptions, clearances, touches in box, saves, clean sheets, heatmaps | `player_season_stats` (every one of these is already a column; heatmaps go in `advanced`) | `PERFORMANCE` |
| Match ratings | `player_match_stats.rating` | `PERFORMANCE` |
| News, announcements, rumours, interviews, social activity, injuries | `player_news` | `NEWS` |
| Written scouting analysis | `intel_reports` | `REPORT` |
| Recruitment judgements | `intel_recommendations` | `RECOMMENDATION` |
| League strength, adaptation risk, transfer pathway | `intel_adaptation_assessments` | `ADAPTATION` |

**There is no need to ask for new tables for the items in the brief.** If
something genuinely has no home, say what it is and it will be modelled — but
check this table first.

---

## 2. The three rules

**Rule 1 — the agent never creates a player.** A submission naming a player the
database does not hold is rejected with `UNRESOLVED_PLAYER`. `players.id` is a
GBM UUID and the identity graph is not extended by an external model. Resolve
first; if the player genuinely is not in the database, tell GBM and a human
adds them.

**Rule 2 — attribute the fact to its source, not to yourself.** If a market
value was read on Transfermarkt, `source_provider` is `TRANSFERMARKT`. The
agent is recorded separately. This matters because the platform ranks sources:
`AVENGERS_GROK` sits at priority **40**, below every primary source it can
cite (Transfermarkt 85, Wyscout 95, GBM's own knowledge 100). An AI summarising
Transfermarkt must not outrank Transfermarkt.

Omitting `source_provider` is a statement that *the agent itself* is the
origin — the fact is stored as `AI_ASSESSED` and is displayed as a model's
assessment, never as a verified fact. Both are legitimate; misrepresenting one
as the other is not.

**Rule 3 — reasoning is not a fact.** A judgement ("suitable for the Jupiler
Pro League") belongs in `RECOMMENDATION` or `REPORT`, never in `FACT`. Facts
compete with other sources on the priority ladder; judgements do not compete
with anything, which is precisely why they must be kept apart.

---

## 3. Authentication

GBM issues the team a Supabase account and registers it in `intel_agents`. The
account is **not** an organisation member, which has a consequence worth
stating plainly:

> The agent can write intelligence and can read nothing. Verified: a caller
> outside `organization_members` sees 0 rows in `players`, `gbm_portfolio`,
> `player_guardians`, `scouting_reports` and `market_values`.

Authenticate as a normal Supabase user and call the functions with that token.

```bash
curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"'"$AGENT_EMAIL"'","password":"'"$AGENT_PASSWORD"'"}'
```

`scopes` on the agent row limits which kinds it may submit. An agent scoped to
news cannot rewrite statistics if its credential leaks. An empty array means
all kinds.

---

## 4. Resolving a player

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/gbm_intel_resolve_player" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"p_name":"Giorgi Kutsia","p_date_of_birth":"1999-10-27"}'
```

```json
[{ "player_id": "…", "full_name": "Giorgi Kutsia", "date_of_birth": "1999-10-27",
   "club_name": "NK Veres Rivne", "match_quality": "NAME_AND_DOB" }]
```

`match_quality` is `NAME_AND_DOB` (safe to use), `EXACT_NAME` (check the club
before using), or `FUZZY_NAME` (do not use without a second identifier). The
function returns identity fields only — never valuation, portfolio status or
contract terms.

---

## 5. Submitting

Every call has the same envelope. `submission_key` is yours to choose and must
be stable for the same piece of intelligence: re-sending it returns the first
result instead of writing twice, which is what makes a retry after a timeout
safe.

```json
{
  "submission_key": "grok-2026-08-26-kutsia-profile",
  "kind": "REPORT",
  "player_id": "8c4f…",
  "data": { }
}
```

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/gbm_intel_submit" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"p_submission": { … } }'
```

### `REPORT` — written analysis, versioned

```json
{ "report_type": "PROFILE",
  "headline": "Ball-winning midfielder ready for a step up",
  "summary": "Two seasons of consistent minutes…",
  "sections": [{ "heading": "Strengths", "body": "Duel volume, positioning." },
               { "heading": "Risks",     "body": "Limited progressive passing." }],
  "metrics": { "duels_won_pct": 58.4, "minutes": 2431 },
  "sources": [{ "name": "Sofascore", "url": "https://…",
                "retrieved_at": "2026-08-26T09:00:00Z", "reliability": 0.8 }],
  "model_name": "grok-4", "confidence": 0.72,
  "period_start": "2025-08-01", "period_end": "2026-05-31" }
```

`report_type` is `PROFILE`, `PERFORMANCE`, `MARKET`, `RECRUITMENT` or
`NEWS_DIGEST`. Submitting the same type again creates version *n+1* and
supersedes the previous one; the earlier version stays readable, which is what
makes "we were wrong about him in March" visible rather than lost.

**An empty `sources` array is an opinion and the interface labels it as one.**

### `RECOMMENDATION` — the recruitment logic engine

```json
{ "recommendation": "MONITOR",
  "fit_label": "Suitable for Belgian First Division",
  "target_competition_id": "…", "target_club_id": null,
  "age_profile": "High potential U21",
  "financial_band": "Under €500k",
  "playing_style": "Deep-lying playmaker",
  "development_potential": "First-team within 18 months",
  "resale_potential": "High resale value profile",
  "rationale": "…", "confidence": 0.6 }
```

`recommendation` is `SIGN`, `MONITOR`, `SCOUT_AGAIN`, `REPRESENT`, `PASS` or
`UNDECIDED` — the same vocabulary GBM's own scouts use, stored in a different
table so a model's view is never counted as a scout's. A new recommendation
supersedes the previous current one.

### `ADAPTATION` — transfer pathway

```json
{ "from_competition_name": "Erovnuli Liga", "to_competition_name": "Jupiler Pro League",
  "technical_gap": "Comfortable technically; press resistance untested.",
  "competition_gap": "Two tiers of intensity.",
  "adaptation_risk": "MEDIUM", "risk_score": 45,
  "next_step": "Loan to a mid-table side before a first-team move.",
  "rationale": "…", "confidence": 0.55 }
```

`*_competition_id` is preferred; the `*_name` fields exist so an assessment is
still recorded when the competition is not in the database yet.

### `NEWS`

```json
{ "headline": "Club confirms contract extension",
  "summary": "…", "source_name": "RSC Anderlecht official",
  "source_url": "https://…", "source_type": "CLUB_OFFICIAL",
  "category": "CONTRACT", "published_at": "2026-08-25T14:00:00Z",
  "confidence": 0.95, "reliability": 1.0,
  "impact": "HIGH", "impact_note": "Removes him from the free-agent list." }
```

Two separate judgements, and conflating them is the usual mistake:

- `confidence` — how sure you are the item **is about this player**.
- `reliability` — how much the **source** is worth. A club announcement and an
  anonymous transfer account are not the same evidence.
- `impact` — `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `NONE`: what it means for
  GBM if true. This is the field that decides whether anyone gets a phone call.

Idempotent on `(player_id, content_hash)`; supply `content_hash` or one is
derived from the URL and headline.

### `PERFORMANCE` — season statistics

```json
{ "source_provider": "SOFASCORE",
  "season_id": "…", "competition_id": "…", "club_id": "…",
  "matches_played": 28, "minutes_played": 2431, "goals": 4, "assists": 6,
  "xg": 3.8, "xa": 5.1, "shots": 41, "key_passes": 52,
  "progressive_passes": 210, "progressive_carries": 96,
  "duels": 380, "duels_won": 222, "aerial_duels": 96, "aerial_duels_won": 51,
  "tackles": 71, "interceptions": 44, "clearances": 33,
  "advanced": { "heatmap": { }, "match_rating_avg": 7.02 } }
```

Keyed by `(player, season, competition, club, provider)`, so resubmitting
corrects rather than duplicates, and Sofascore's numbers never overwrite
FotMob's. Anything without a column goes in `advanced`.

### `FACT` — an assertion about the canonical record

```json
{ "fact_key": "market_value_eur", "value_numeric": 400000,
  "source_provider": "TRANSFERMARKT", "source_url": "https://…",
  "confidence": 0.9 }
```

This does **not** write `players` or `market_values` directly. It records that
a provider asserted a value, on a date, with a URL. `provider_fact_priority`
decides what the platform displays, and a disagreement between two sources is
kept and shown rather than silently resolved.

---

## 6. Responses

```json
{ "status": "ACCEPTED", "submission_id": "…", "report_id": "…" }
```

| `status` / `error` | Meaning |
|---|---|
| `ACCEPTED` | Written. The id of the created row is included. |
| `DUPLICATE` | This `submission_key` was already processed; the original result is returned. Not an error — stop retrying. |
| `KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | The key was used for different content. Use a new key. |
| `UNRESOLVED_PLAYER` | No `player_id`. Resolve first; players are never created here. |
| `UNKNOWN_PLAYER_ID` | The id does not exist. |
| `KIND_NOT_IN_AGENT_SCOPES` | This agent may not submit this kind. |
| `UNKNOWN_KIND` | Valid kinds are returned in the response. |
| `MISSING_SUBMISSION_KEY_OR_KIND` | Envelope incomplete. |
| `WRITE_FAILED` | The write raised; `detail` and `sqlstate` are included. |

A bad payload returns a rejection rather than raising, so the caller always
gets a machine-readable answer. Only "you are not a registered agent" raises
(`42501`).

Every call is recorded in `intel_submissions` with its payload, so a number
that looks wrong on a player profile can be traced to the submission that
produced it.

---

## 7. What GBM sees

Nothing needs to be deployed when intelligence arrives. The platform reads
Supabase on every request, so a submission is visible on the next page load:
player profiles, reports and dashboards all update on their own. Frontend work
is only required for a genuinely new *kind* of intelligence — one that needs a
component that does not exist yet.

AI-generated material is always labelled as such and is never merged into
human scouting reports or shown as a verified fact. That separation is not
presentation: it is enforced by which table the row is in.

---

## 8. Open items for GBM

1. **Issue the agent account.** Create a Supabase user for the team, insert the
   `intel_agents` row (`agent_code` `AVENGERS_GROK`, `provider_code`
   `AVENGERS_GROK`), and set `scopes` to the kinds it should be trusted with.
   Start narrow — `NEWS` and `REPORT` — and widen once the output has been
   reviewed.
2. **Decide the review posture.** Everything submitted is visible immediately.
   If GBM would rather AI recommendations were approved before a scout sees
   them, that is a review queue and a small amount of work; say so and it will
   be added.
