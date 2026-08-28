import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `gbm_merge_player` resolved a unique-key collision like this:
 *
 *     exception when unique_violation then
 *       execute format('delete from %I where %I=$1', tbl, col) using p_dup;
 *
 * The DELETE has no key predicate, so one colliding row did not remove one row
 * — it removed every row the duplicate owned in that table. Measured on
 * synthetic players before the fix: a duplicate with three season-stat rows,
 * one of them colliding, lost all three.
 *
 * Entity resolution is a core GBM operation, so these tests pin the properties
 * that make a merge safe. They read the migrations rather than the database,
 * so they fail in CI on the change itself rather than after it has reached
 * production — the same approach as `intel-contract.test.ts`.
 *
 * The behavioural half of the proof lives in the migration's own guard, which
 * merges two synthetic players, asserts the row accounting, and removes them
 * again. A database that will not produce the right numbers refuses the
 * migration.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function migrationText(): string {
  return migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

/**
 * Comments have to go before anything is matched. The migration that fixes
 * this defect quotes the defective line verbatim in its header, to explain
 * what went wrong — so a test reading the raw file finds the old bulk DELETE
 * in the documentation and fails a correct migration. Strip `--` comments and
 * match the code only.
 */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      // Naive but sufficient here: no `--` appears inside a string literal in
      // these migrations, and the assertion below pins that assumption.
      const at = line.indexOf('--');
      return at === -1 ? line : line.slice(0, at);
    })
    .join('\n');
}

/** The newest definition wins: later migrations replace earlier ones. */
function currentMergeFunction(): string {
  const withFn = migrationFiles().filter((f) =>
    readFileSync(join(MIGRATIONS, f), 'utf8').includes(
      'function gbm_merge_player',
    ),
  );
  expect(withFn.length).toBeGreaterThan(0);
  return stripSqlComments(
    readFileSync(join(MIGRATIONS, withFn[withFn.length - 1]), 'utf8'),
  );
}

describe('player merge safety', () => {
  const fn = currentMergeFunction();
  const sql = migrationText();

  it('never bulk-deletes the duplicate rows as conflict resolution', () => {
    // The exact shape of the original defect. A DELETE keyed only on the
    // duplicate's id, reached from an exception handler.
    expect(fn).not.toMatch(/delete from %I where %I=\$1/i);
    expect(fn).not.toMatch(/delete from %I where %I = \$1'\s*\)\s*using p_dup/i);
  });

  it('deletes only the single row it just archived, by ctid', () => {
    expect(fn).toContain("delete from %I where ctid = $1");
  });

  it('archives a conflicting row before removing it', () => {
    const handler = fn.slice(fn.indexOf('exception when unique_violation'));
    const insertAt = handler.indexOf('insert into player_merge_conflicts');
    const deleteAt = handler.indexOf('delete from %I where ctid');
    expect(insertAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    // The archive must happen first, or the payload is gone before it is read.
    expect(insertAt).toBeLessThan(deleteAt);
    expect(handler).toContain('to_jsonb(t)');
  });

  it('records the merge and keeps the duplicate player row as a snapshot', () => {
    expect(sql).toContain('create table if not exists player_merges');
    expect(fn).toContain('duplicate_snapshot');
    expect(fn).toContain('to_jsonb(p.*)');
  });

  it('covers source_facts, which reaches players without a foreign key', () => {
    // The catalog loop is driven by pg_constraint, and source_facts points at
    // a player through (entity_type, entity_id) with no FK at all. Dropping
    // this line strands every merged player's provenance on a deleted id.
    expect(fn).toContain("select 'source_facts', 'entity_id'");
    expect(fn).toContain("entity_type = ''PLAYER''");
  });

  it('keeps both representation records rather than archiving one', () => {
    // The partial unique index only applies to is_current, so demoting the
    // duplicate's record lets both rows survive the merge.
    expect(fn).toContain('update representation_records');
    expect(fn).toContain('set is_current = false');
  });

  it('refuses a merge that looks reversed unless it is forced', () => {
    expect(fn).toContain('MERGE_LIKELY_REVERSED');
    expect(fn).toContain('gbm_portfolio');
    expect(fn).toMatch(/p_force\s+boolean\s+default\s+false/i);
  });

  it('refuses null arguments and self-merges', () => {
    expect(fn).toContain('MERGE_NULL_ARGUMENT');
    expect(fn).toContain('MERGE_INTO_SELF');
  });

  it('is idempotent: a completed merge replays as its own report', () => {
    expect(fn).toContain('already_merged');
    expect(fn).toContain('from player_merges where duplicate_id = p_dup');
  });

  it('serialises concurrent merges on both players', () => {
    expect(fn).toContain('pg_advisory_xact_lock');
  });

  it('stays unreachable from the API', () => {
    // SECURITY DEFINER with a pinned search_path, and no client role may call
    // it — the same rule migration 0044 applied to the other unguarded writers.
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path to 'public'/i);
    expect(fn).toMatch(
      /revoke all on function gbm_merge_player\(uuid, uuid, boolean\) from public, anon, authenticated/i,
    );
  });

  it('protects the merge audit tables with row level security', () => {
    expect(sql).toContain('alter table player_merges           enable row level security');
    expect(sql).toContain('alter table player_merge_conflicts  enable row level security');
  });
});
