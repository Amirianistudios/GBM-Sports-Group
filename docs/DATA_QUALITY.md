# Data quality

Thirteen checks, one function, one screen. Verified 2026-08-28 against project
`tyzndcjuiffnyhluddce`.

    select gbm_data_quality_report();

Returns jsonb, so the application at `/data/quality` and the ingestion
workflows read the same answer rather than two implementations that drift.

## It counts. It does not fix.

The merge defect destroyed data because a function resolved a conflict on its
own, silently, and nobody saw it for four days. Every check here reports a
number and names what it means. Repair is a human decision with a migration
behind it.

## The checks, and what a non-zero means

### Identity

| Check | Non-zero means | First run |
|---|---|---:|
| `duplicate_external_ids` | one provider id points at several GBM players — one is wrong | **5** |
| `players_sharing_a_provider_id` | a player holds two ids for one provider, usually merge residue | **25** |
| `duplicate_players_name_dob` | same name and birth date twice: a merge candidate | 0 |

### Provenance

| Check | Non-zero means | First run |
|---|---|---:|
| `orphan_source_facts` | provenance pointing at a deleted player | 0 |
| `source_records_unlinked` | raw payload never tied to a player — informational | 12 |

`source_facts` reaches players through `(entity_type, entity_id)` with no
foreign key, so nothing in the database prevents an orphan. That is why it is
checked rather than assumed.

### Football sanity

| Check | Non-zero means | First run |
|---|---|---:|
| `stats_without_competition` | season stats unattributable to a league | 0 |
| `contracts_expiring_in_the_past` | ACTIVE but expired over two years ago | 0 |
| `market_values_dated_in_the_future` | a valuation post-dating today | 0 |
| `duplicate_current_representation` | two current agency positions for one player | **13** |
| `players_with_club_outside_their_league` | club country ≠ competition country | **3** |

### Caches and queues

| Check | Non-zero means | First run |
|---|---|---:|
| `cache_name_id_mismatch` | printed league and scored competition differ | 0 |
| `unresolved_merge_conflicts` | archived rows awaiting review | 0 |
| `merge_survivors_needing_reingest` | merge survivors below population coverage | **39** |

## What the first run found

Four real problems, none of them previously visible:

**25 players holding two ids for one provider** and **5 provider ids pointing
at several players** are the same identity problem from both directions. Both
are residue of merges and imports; each needs a human to decide which id is
right. The fixed `gbm_merge_player` now reports this as
`provider_id_conflicts` on every merge.

**13 players with two current representation records.** A player has one agency
position per provider at a time; two means one is stale and
`NO_AGENCY_LISTED` may be showing against a player who has an agency, or the
reverse. This matters more than its size — representation accuracy is the
product.

**39 merge survivors below population coverage.** See
[`CURRENT_STATE.md`](CURRENT_STATE.md) for the cohort analysis; recovery is
re-ingestion, not repair.

## Thresholds

`/data/quality` grades each check `clear`, `look` or `act`. The thresholds live
next to the checks in `apps/web/src/app/data/quality/page.tsx` and are
deliberately tight — a check whose warning level is set above its current value
is decoration.

Four checks fail at any non-zero value, because there is no benign version of
them: orphaned provenance, stats with no competition, a future-dated
valuation, and a cache whose name and id disagree.

## Running it

- **In the app**: `/data/quality`, under Organization.
- **In SQL**: `select jsonb_pretty(gbm_data_quality_report());`
- **In CI**: the `reep-enrich` workflow runs `pnpm quality:check` after every
  enrichment and writes it to the run summary.

## Related

- [`ENTITY_RESOLUTION.md`](ENTITY_RESOLUTION.md)
- [`AUTOMATION.md`](AUTOMATION.md)
- [`SECURITY.md`](SECURITY.md)
