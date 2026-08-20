# Vercel architecture audit

**Audited 2026-08-20.** Scope: make Vercel a pure deployment layer —
`main` → production, nothing else — without breaking the production deploy,
touching the data pipelines, or touching Supabase security. Everything below
was verified this session from primary evidence; anything unverifiable from
here is marked as such and assigned to the project owner.

The target architecture, restated:

```
GitHub    source code, development, docs, workflows, migrations   (source of truth: application)
Supabase  database, auth, storage, football data                  (source of truth: data)
Vercel    frontend deployment only:  main → production            (stores nothing, decides nothing)
```

## 1. What Vercel currently does — verified

| Fact | Evidence |
|---|---|
| The Vercel GitHub App **is installed** on `Amirianistudios/GBM-Sports-Group` and reacts to every push | A `Vercel Preview Comments` check run (details_url `vercel.com/github`) is present on the working branch's PR head — timestamped today |
| Every push to **every** branch produces a preview deployment | This is Vercel's default behaviour for a Git-connected project; nothing in the repository overrides it (see next row). Today's 13 working-branch pushes will each have produced one |
| The repository contains **zero Vercel configuration** | No `vercel.json` anywhere, no `.vercel/` directory, stock `next.config.ts`, no Vercel-specific code paths (the only artefacts are create-next-app's default SVGs in `apps/web/public/`) |
| The application stores **nothing** on Vercel and has no Vercel-specific backend | `apps/web` is a stateless Next.js frontend; every read goes to Supabase at request time through the anon key + RLS; auth is Supabase; there are no API routes writing data, no blob/KV/edge-config usage, no cron. Verified in `GBM_CURRENT_STATE_AUDIT.md` §2.4 |
| The Vercel **project is not reachable from this session's Vercel connection** | The connected Vercel account (`amirianantoni10-9420's projects`) contains **zero projects**. The real project lives under a different Vercel login (the owner's). Project-level settings — build config, environment variables, production branch, domains — can therefore not be read or changed from here, only documented |
| `gbm-sports-group.vercel.app` serves `DEPLOYMENT_NOT_FOUND` | The production deployment exists under some other name/domain, or the documented URL was never the real one. The docs' claim of a `gbm-sports-group` project has never been verified from any session (the original machine had no `vercel` CLI; this session's Vercel login cannot see it) |

**Conclusion of the inspection:** the codebase already treats Vercel as
deployment-only. The deviation from the target architecture is entirely on the
platform side, and it is exactly one thing: **default preview deployments for
every branch push.**

## 2. What should remain

- The GitHub App integration itself: push to `main` → automatic production
  deployment. This is the deploy pipeline and must not be removed.
- The two runtime environment variables on the Vercel project —
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by
  design; RLS constrains every query). Nothing else is needed to build or run
  the frontend. The service-role key must **never** appear here.
- The workspace property that makes builds root-directory-agnostic
  (`apps/web` has no `workspace:*` dependencies).

## 3. What should be removed or changed

| Item | Change | Mechanism |
|---|---|---|
| Preview deployments on every branch push | **Stop building anything that is not a production deployment** | `vercel.json` `ignoreCommand` (applied — see §4) |
| Unverifiable docs claim (`Vercel project gbm-sports-group … deployed URL`) | Corrected to what is actually verified | `DEPLOYMENT.md` update in this commit |
| Nothing else | The inspection found no data on Vercel, no Vercel-specific logic, no manual deployments, no extra resources to remove | — |

## 4. The preview-deployment fix (applied)

**Why previews happen:** Vercel's Git integration defaults to building every
push on every branch as a preview deployment. No repository or (evidently)
dashboard setting overrides that default here.

**The fix chosen — repo-resident, account-agnostic:** a two-line
`vercel.json`, placed at **both** the repository root and `apps/web/` (the
project's Root Directory setting cannot be read from here, and it may
legitimately be either — the file must be wherever Vercel looks):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "[ \"$VERCEL_ENV\" != \"production\" ]"
}
```

Semantics: Vercel runs `ignoreCommand` before building. Exit code 0 skips the
build; non-zero proceeds. For any non-production deployment the test is true →
exit 0 → **skipped**: no build minutes, no preview URL, nothing published. For
a production deployment (`VERCEL_ENV=production`, i.e. a push to the
production branch) the test is false → exit 1 → the build proceeds untouched.

Properties that made this the right mechanism:

- **It cannot break production.** The guard is on `VERCEL_ENV`, not on a
  branch name, so it keeps working even if the production branch is ever
  renamed, and manual promotions still build.
- **It lives in Git**, versioned and reviewable — the deployment behaviour is
  now part of the source of truth instead of a dashboard setting nobody can
  audit from the repository.
- **It works for every branch, present and future** (`claude/*`, feature
  branches, anything) with no per-branch enumeration.
- **It takes effect per branch as soon as the file is on that branch** — the
  push that adds it is already skipped. Branches created from `main` after the
  merge inherit it.

**Residual, cosmetic:** skipped deployments still appear in the Vercel
dashboard as "Ignored/Canceled" entries (zero build time, no URL), and the
"Vercel Preview Comments" check may still attach to PRs. Removing even those
records requires the project owner in the Vercel dashboard — see §6.

## 5. Risks

| Risk | Assessment |
|---|---|
| Breaking the production deploy | The guard only ever *skips non-production* builds; production takes the exit-1 path. If the file were somehow malformed, Vercel fails the deployment loudly rather than deploying wrongly — and the file is two lines |
| Root Directory mismatch | Covered by placing identical files at both candidate roots; the one Vercel reads wins, the other is inert |
| Wanting a preview one day | Deliberate: the stated architecture is "main → production, nothing else". If a preview is ever wanted, delete the file on that branch or use the dashboard's per-branch controls |
| Data pipelines / Supabase | Untouched. The GitHub Actions ingestion workflows have no Vercel involvement; Supabase security was not modified |

## 6. Owner-side items (cannot be done from this session)

The Vercel project lives under a different Vercel login than the one connected
here, so these need the project owner in the dashboard — none are required for
the architecture to hold, the `vercel.json` already enforces the behaviour:

1. **Optional — full preview silence:** Project → Settings → Git → disable
   preview deployments / limit deployments to the production branch (naming
   varies by plan). This removes even the "Ignored" records and PR comments.
2. **Verify the env var set:** exactly `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`; remove anything else, and confirm no
   service-role key is present under any name.
3. **Confirm the production branch is `main`** and note the real production
   domain (the documented `gbm-sports-group.vercel.app` does not resolve to a
   deployment).
4. **Confirm no extra Vercel resources exist** (Blob, KV, Edge Config, Cron,
   Postgres) — the application uses none; anything found is orphaned and can
   be deleted.
5. If the owner prefers Claude to verify these directly in future sessions,
   connect the Vercel account that owns the project (the currently connected
   one is empty).

## 7. Resulting architecture

```
Development:   GitHub branch → CI gates (Actions) → merge to main
Deployment:    main → Vercel production build → serve frontend   (previews: skipped)
Data:          GitHub migrations → Supabase        (weekly ingestion via Actions → Supabase)
```

GitHub and Supabase hold everything important. Vercel builds what lands on
`main`, serves it, and does nothing else.
