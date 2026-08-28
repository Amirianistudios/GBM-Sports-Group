# Can GitHub rebuild the GBM database?

The question this file answers: if the Supabase project vanished, would
`supabase/migrations/` produce it again?

**Status on 2026-08-28: proven statically, not by execution — and that is a
deliberate choice, not an oversight.** Every static check passes. The
preview-branch rebuild was costed at $0.01344/hour and declined by GBM on
2026-08-28; revisit before the next event that would depend on it (see
*When to revisit* below).

## Why it needed asking

Between 2026-08-24 and 2026-08-28 the answer was **no**. Twenty objects — six
tables, one view, thirteen functions — existed only in production, applied
directly by a parallel session. A rebuild from the repository would have
produced a database missing the whole SofaScore/Transfermarkt ingestion path,
and nobody would have discovered it until the rebuild was needed.

Migration `20260901130000_capture_the_out_of_band_objects` closed the object
gap. This file is about proving the closure, not asserting it.

## What has been verified, and how

### Object parity — verified

Every table, view and function in `public` was checked against a full-text
search of `supabase/migrations/`. **Objects with no representation in the repo:
0.** Before the capture: 20.

### The captured definitions are faithful — verified

The capture was transcribed from the live catalog (`pg_get_functiondef`,
`pg_get_viewdef`, `pg_get_constraintdef`), not written from memory, and then
checked:

- all **14 function bodies** hash identically to `pg_proc.prosrc` after
  normalising away comments and whitespace — byte-equivalent, not approximately
  right;
- the view's **47 output columns** match production in name and order;
- table DDL was generated from `information_schema` and `pg_constraint` rather
  than typed.

### Ordering — verified by reasoning, not by execution

The hardening migration revokes, alters and pins **16 objects that only the
capture creates**. Applied in filename order the capture must come first, and
originally it did not: `supabase/migrations/` would have failed on the
hardening's first statement. The two files were renumbered so the capture is
0043 and the hardening 0044.

That ordering is argued from the dependency list. It has not been executed
against an empty database, which is precisely what the preview branch is for.

## What is still missing

A run of the full chain from empty. Specifically:

1. Create a development branch of `tyzndcjuiffnyhluddce`.
2. Apply all 44 migrations in chronological order from an empty database.
3. Check for: missing objects, ordering failures, duplicate-object errors,
   missing types, broken dependencies, security-function failures, view
   failures, policy failures, function resolution errors.
4. Diff the preview schema against production — tables, columns, types,
   constraints, indexes, views, functions, triggers, RLS state, policies,
   grants. Equivalence of **structure**, not of data.
5. Record every mismatch here, fix it in a migration, and re-run.

### Why it has not run

A Supabase development branch on this organisation costs **$0.01344/hour**
(≈$0.01–$0.03 for a create-verify-delete cycle, ≈$9.70/month if left running).
Put to GBM on 2026-08-28 and **declined for now**. Nothing technical stands in
the way; it is a spending decision.

The alternative — proving the chain against production — is not an
alternative. Production is the thing being protected.

### What that leaves unproven

Static analysis establishes that the repository *contains* everything
production has, and that the captured definitions are faithful. It cannot
establish that the 44 files **execute** cleanly from empty, in order. The
specific risks that only execution can rule out:

- an ordering fault beyond the one already found and fixed (the capture had to
  move ahead of the hardening, which was caught by reading dependencies — a
  second such fault would be caught the same way only if someone looks);
- a type or extension a migration assumes but never creates, because
  production acquired it by another route;
- a policy or grant that fails on a database where the referenced role or
  helper does not yet exist.

None of these affect the running system. They affect the day the database has
to be rebuilt, which is exactly the day nobody wants to discover them.

### When to revisit

Do it before any of these:

- restoring or relocating the project, or standing up a second environment;
- reconciling the migration ledger — `migration repair` marks files applied
  without running them, so repairing on an unproven chain can permanently hide
  a migration that never worked (see [`MIGRATION_LEDGER.md`](MIGRATION_LEDGER.md));
- onboarding anyone who needs a local or staging database from the repo.

## When it runs, record here

| Field | Value |
|---|---|
| Preview branch ref | *not created — declined 2026-08-28* |
| Branch created | *pending* |
| Migrations applied | *pending* (44 expected) |
| Chain result | *pending* |
| Schema mismatches found | *pending* |
| Mismatches fixed in | *pending* |
| Final result | *pending* |

### Comparison queries to use

Run against both the branch and `tyzndcjuiffnyhluddce`, then diff:

```sql
-- tables and columns
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_schema='public'
 order by 1,2;

-- constraints
select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
  from pg_constraint c join pg_namespace n on n.oid=c.connamespace
 where n.nspname='public' order by 1,2;

-- indexes
select tablename, indexname, indexdef from pg_indexes
 where schemaname='public' order by 1,2;

-- views (definition text, normalised)
select table_name, md5(regexp_replace(view_definition,'\s+','','g'))
  from information_schema.views where table_schema='public' order by 1;

-- functions (body hash, comments and whitespace stripped)
select p.proname, pg_get_function_identity_arguments(p.oid),
       md5(regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+','','g'))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' order by 1,2;

-- RLS state and policies
select c.relname, c.relrowsecurity from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by 1;

select c.relname, p.polname, p.polcmd::text,
       pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid)
  from pg_policy p join pg_class c on c.oid=p.polrelid order by 1,2;

-- grants that matter
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated')
 order by 1,2,3;
```

Expected differences that are **not** faults: row counts, sequence values, the
contents of `supabase_migrations.schema_migrations`, and anything seeded from
live data.

## Related

- [`MIGRATION_LEDGER.md`](MIGRATION_LEDGER.md) — the ledger reconciliation this
  rebuild is a prerequisite for.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — the verified counts.
