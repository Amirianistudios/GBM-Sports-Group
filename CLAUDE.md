# GBM Intelligence — working notes

Private football scouting and talent intelligence platform for GBM Sports Group.
Read `docs/CURRENT_STATE.md` next; it holds verified facts and row counts.

## Architecture, and why

```
LOCAL → GITHUB main → VERCEL (auto-deploy)
                          ↓
                      SUPABASE (live data + auth)
```

- **GitHub** is the source of truth for the application. **Supabase** is the
  source of truth for data. **Vercel** only builds what is on `main`.
- Never run `vercel deploy`. Push to `main`; the Git integration deploys. A
  manual deployment cannot be traced back to a commit.
- Never move live data into Git. Never commit secrets.

## Non-negotiables in this codebase

**`players.id` is a GBM UUID.** A provider id is never a primary key. Provider
ids belong in `player_external_ids` with `confidence` and `match_method`. Reep
bootstraps the identity graph; if Reep vanished the graph would survive.

**Every fact keeps its origin.** `source_records` holds raw payloads,
`source_facts` records which provider asserted which value. Two sources that
disagree are both retained and the conflict is shown — `provider_fact_priority`
decides what is displayed, per fact, never one global winner.

**`NO_AGENCY_LISTED` ≠ unrepresented.** It records what a source displayed on a
date. Every surface showing it must say so. This caveat is the difference
between a useful research queue and a misleading one.

**Scout opinion never mixes with provider statistics.** Scouting reports and
ratings live in their own tables and stay there.

**Ingestion is idempotent and observable.** Every run opens an `ingestion_runs`
row and closes it even when it throws. Re-running must update, never duplicate —
which is why the append-only tables have natural keys with `NULLS NOT DISTINCT`.

## Workspace

`@gbm/web` · `@gbm/providers` · `@gbm/database` · `@gbm/ingestion`

`apps/web` has **no `workspace:*` dependencies** on purpose: it must install and
build standalone whether Vercel's Root Directory is the repo root or `apps/web`.
If you add one, you risk the deployment. It keeps its own copy of the generated
database types for the same reason; `pnpm db:types` writes both copies.

## Before pushing

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

`pnpm build` must pass. It is exactly what Vercel runs, and a failure here is a
failed deployment.

## Client-side normalisation mirrors the database

`services/ingestion/src/normalize.ts` reimplements `gbm_normalize_name()`. If
the two drift, the importer stops recognising entities the database already
holds and silently creates duplicates. `normalize.test.ts` pins the contract —
change one side, change both.

## Out of scope right now

Wyscout. The adapter exists and is written against the real OpenAPI v3 spec, but
nothing is configured and no code path requires it. Leave it alone.
