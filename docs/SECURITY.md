# Security posture

Verified 2026-08-28 against project `tyzndcjuiffnyhluddce`.

**Supabase security advisors: 0 ERROR.**

## The rules this schema holds itself to

Each is checked by a guard inside the migration that established it, so
reintroducing the fault fails the migration rather than reaching production.

| Rule | State |
|---|---|
| No SECURITY DEFINER function in `public` has a mutable `search_path` | holds |
| No table in `public` has row level security disabled | holds |
| No view in `public` runs as its creator | holds |
| No unguarded write function is callable from the API | holds |
| No secret is stored in a form that is not a digest | holds |
| `claude_agent_secrets` is granted to no client role | holds |

## What was wrong, and when

Between 2026-08-24 and 2026-08-28 an ingestion path built directly against
production carried a set of defects that no review saw, because none of it was
ever committed. Fixed in `20260901140000_the_agent_path_gets_the_same_locks`.

**Nine SECURITY DEFINER functions with no authorisation check, executable by
`anon`** — the unauthenticated role whose key ships in the browser bundle:

    gbm_merge_player, gbm_merge_club          merge and delete rows
    ingest_sofascore_batch                    writes
    ingest_tm_agent_batch                     writes representation records
    ingest_tm_profile_batch                   writes profiles
    claude_write_reports                      writes intel reports
    claude_compute_percentiles                rewrites 33,670 rows
    claude_flag_tm_club_mismatch              writes
    claude_invalidate_bad_tm_matches          writes

Two of them take only scalar arguments, so they needed no identifiers to call.
EXECUTE is now revoked from `public`, `anon` and `authenticated`; they are
driven from privileged SQL, not from the API.

The revoke has to name **PUBLIC**. Postgres grants EXECUTE to PUBLIC by default
and the two Supabase roles hold their access through that grant, so revoking
from the roles alone changes nothing. The first attempt did exactly that and
the migration's own guard rejected it.

Also fixed in the same migration:

- **`sofascore_tournaments` had RLS disabled entirely**, granted to `anon`.
- **`v_claude_candidates` was a SECURITY DEFINER view.** It exposes name, date
  of birth, nationality, market value and agency per player and evaluated RLS
  as its creator, so `anon` could read all of it.
- **Thirteen functions carried a mutable `search_path`** — on a SECURITY
  DEFINER function that is the standard privilege-escalation shape, and one of
  them authenticates an agent token against a table *by name*.
- **The agent token was stored in plaintext**, in a table granted to `anon` and
  `authenticated` with RLS-and-no-policies the only thing denying them. It is
  now a SHA-256 digest; the caller sends the same string and the function
  hashes it before comparing, so no coordination was needed. Both the accept
  and reject paths were verified against the live function in a rolled-back
  transaction.

## Deliberately left in place

**`staging_ingest` keeps an unauthenticated INSERT policy**, restricted to
three source values. It is the external scraper's drop-box; `anon` cannot read
back, update or delete through it. Removing it would break a running
collection, so it is flagged rather than taken. Revisit when the scraper can
authenticate.

**`claude_tm_queue` keeps `anon` EXECUTE**, because the token is its
authentication. With `search_path` pinned and the secret hashed, the two things
that made that check weak are gone.

**Supabase's default TRUNCATE grant** is held by `anon` on 71 tables and
`authenticated` on 76. TRUNCATE is never filtered by RLS — but PostgREST
exposes no TRUNCATE and both roles are NOLOGIN, so nothing reaches it.
Narrowing it schema-wide is a deliberate decision with an API re-test attached,
not a side effect of another change.

**Leaked-password protection is off** in Supabase Auth. One dashboard toggle;
worth turning on.

## Credentials

**The Grok agent password is compromised and ROTATION IS STILL REQUIRED.** It
was printed in plain text in a chat report on 2026-08-28.

Verified about that credential:

- it was **never committed** — zero blobs containing it across all branches,
  zero commits by `git log -S` for both the password and the address, and it
  appears in no tracked file;
- it is referenced nowhere in source, so there is no configuration to convert
  to environment variables;
- the working copies held outside the repository have been shredded.

The exposure is the chat transcript, which persists. Rotate in Supabase Auth
and hand the new value to the agent operator out of band.

## Rules for anyone adding to this schema

1. Every SECURITY DEFINER function sets `search_path` explicitly.
2. Every table in `public` enables RLS, even if the policy set is empty —
   RLS with no policy denies everything, which is a decision; RLS off is an
   accident.
3. Every view is created `with (security_invoker = on)`.
4. A function that writes and has no authorisation check of its own must not be
   granted to `public`, `anon` or `authenticated`.
5. Secrets are stored as digests. A table holding one gets no client grant.
6. `revoke` statements name `public` first.
7. Never add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.

## Related

- [`CURRENT_STATE.md`](CURRENT_STATE.md)
- [`AVENGERS_INTEL_CONTRACT.md`](AVENGERS_INTEL_CONTRACT.md) — the external
  agent's write path and why it can write without reading.
