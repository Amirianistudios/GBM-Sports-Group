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
| The Vercel **project was located on the second pass** (see §6) | Project `gbm-sports-group`, id `prj_to6e5a4jT2170ZN244pTvh7NDEOx`, team `amirianantoni10-9420s-projects` — the connected team. The connector's authorization excludes this specific project (explicit 403 on deployment listing), which is the one remaining access gap |
| `gbm-sports-group.vercel.app` serves `DEPLOYMENT_NOT_FOUND` | That global alias is not this project's. The real production deployment serves at `gbm-sports-group-git-main-amirianantoni10-9420s-projects.vercel.app` behind Vercel Authentication (verified: 302 → `vercel.com/sso-api`) |

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

## 6. Execution update — 2026-08-20, second pass

The five items formerly listed here as owner-side were executed as far as the
platform's authorization allows, after a discovery that changes §1: **the
project was located.** Vercel's own bot comment on PR #1 carries the project
metadata verbatim: project **`gbm-sports-group`**, id
`prj_to6e5a4jT2170ZN244pTvh7NDEOx`, team **`amirianantoni10-9420s-projects`**
(`team_95RPwrZUu4shUPvqJPrvTUZH`) — the very team this session's Vercel
connection belongs to — monorepo, Root Directory = repository root (so the
root `vercel.json` is the one Vercel reads; the `apps/web` copy is inert
insurance).

The connection is team-correct but **project-scoped out**: `get_project` and
deployment-protection reads return 404, `list_deployments` returns an
explicit 403 ("You don't have permission to list the deployment"), and the
protected-URL fetch is refused. The Claude ↔ Vercel connector was authorized
without access to this project.

Status of the five items:

| # | Item | Status |
|---|---|---|
| 1 | Preview deployments disabled for every non-production branch | **VERIFIED working, twice** — from Vercel's own output, not inference: the bot comment reads *"1 Skipped Deployment … Ignored"* (`nextCommitStatus: IGNORED`) for two consecutive branch pushes. The `vercel.json` `ignoreCommand` enforces exactly the target behaviour: branch push → GitHub CI only, no Vercel build, no preview URL. **CHANGED** additionally: `"github": { "silent": true }` is set in both `vercel.json` copies; observed behaviour so far: the existing PR comment still *updated* on the push that introduced the flag, so comment suppression is at least partly governed by project-level settings rather than the repo file — the record-level silence (no "Ignored" rows, no comment) remains **BLOCKED BY AUTHORIZATION** and cosmetic: nothing is built or published either way. |
| 2 | Environment variables cleaned and verified | **Codebase side VERIFIED**: the frontend reads exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`apps/web/src/lib/supabase/env.ts`), holds no service credentials, and no code path can exfiltrate a server-side variable. Reading/removing variables stored in the Vercel project is **BLOCKED BY AUTHORIZATION** (project scope; the connector also exposes no env-var API). Risk bounding: a stray variable there would be unused by any shipped code. |
| 3 | Production branch + domain | **VERIFIED from outside**: a production deployment from `main` exists and serves at `gbm-sports-group-git-main-amirianantoni10-9420s-projects.vercel.app`, sitting behind **Vercel Authentication** (302 → `vercel.com/sso-api` — platform-level protection in front of the app's own Supabase auth; appropriate for an internal tool and left as is). The global `gbm-sports-group.vercel.app` is **not** this project's domain (`DEPLOYMENT_NOT_FOUND`) and the docs no longer claim it. Changing/confirming the Production Branch *setting* itself: **BLOCKED BY AUTHORIZATION**, but behaviourally moot — `main` demonstrably produces the production deployment, and the `ignoreCommand` guard is on `VERCEL_ENV`, not a branch name. |
| 4 | Unused resources (Blob, KV, Edge Config, Cron, Postgres, functions config) | **Codebase side VERIFIED**: zero references to any Vercel storage/KV/blob/edge-config/cron SDK or API anywhere in the repository; the app defines no crons and no special functions config. Enumerating the project's provisioned resources is **BLOCKED BY AUTHORIZATION**. Nothing repo-side can create or use such a resource, so any that existed would be orphaned by construction. |
| 5 | Account/project access | **RESOLVED to a precise, single grant**: the right team is already connected; the connector's authorization simply excludes the `gbm-sports-group` project. Re-authorizing the Vercel connector on claude.ai with access to this project (or all team projects) unblocks items 1's cosmetic remainder, 2, 3's setting-level confirmation and 4 in one step. |

## 7. Resulting architecture

```
Development:   GitHub branch → CI gates (Actions) → merge to main
Deployment:    main → Vercel production build → serve frontend   (previews: skipped)
Data:          GitHub migrations → Supabase        (weekly ingestion via Actions → Supabase)
```

GitHub and Supabase hold everything important. Vercel builds what lands on
`main`, serves it, and does nothing else.

## Why `vercel.json` carries no explanatory key (2026-08-22)

Six consecutive production deployments failed — `7088909`, `d4b62f4`,
`269567c`, `99ddcc7`, `c799e4d`, `80bf759` — and the cause was in this
repository the whole time, invisible to every gate we run.

`vercel.json` had gained a `_comment` array holding the reasoning behind the
ignore rule, because JSON has no comment syntax. Vercel's published schema
(`https://openapi.vercel.sh/vercel.json`) sets **`additionalProperties: false`**
at the top level, and `_comment` is not among its forty permitted keys, so
every deployment was rejected before the build began. Local builds could not
catch it: a local `next build` never reads `vercel.json`.

The last green deployment, `4b3d31c`, predates the key. `b66a512` — merged as
`4996555` — introduced it. That is the regression window exactly.

`apps/web/src/lib/vercel-config.test.ts` now fails the CI gate on any key
outside a small allowlist, so the same mistake cannot reach `main` again.

### The ignore rule, explained here instead

```
if ref == main            -> exit 1  (build)
if VERCEL_ENV == preview  -> exit 0  (skip)
otherwise                 -> exit 1  (build)
```

Branch-first, on purpose. The original rule was `[ "$VERCEL_ENV" !=
"production" ]`, which skips whenever that variable is anything but the exact
string — an empty value skips, and if the project's production branch were
ever not `main`, a push to main would arrive as a preview and be skipped in
silence. A skipped build is indistinguishable from one that never started, so
production would stop moving with nothing to see. Failing towards a wasted
build is the cheaper mistake. The step echoes `VERCEL_ENV`, the ref and the
sha, so the next failure is readable from the build log.

`github.silent` is `false` deliberately: Vercel's commit statuses are the only
outside-in evidence of what it did with a push to `main`.
