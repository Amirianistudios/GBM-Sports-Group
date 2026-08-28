/**
 * The recovery state machine is the contract MERGE_RECOVERY.md documents and
 * the quality page renders. These tests pin its truth table, and pin the
 * migration to the same vocabulary — a state the database rejects, or a state
 * the view can emit that the application never learned, would otherwise only
 * surface in production.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { RECOVERY_STATES, classifyRecovery, type Coverage } from './recovery.js';

const cover = (partial: Partial<Coverage> = {}): Coverage => ({
  season_stats: 0,
  market_values: 0,
  transfers: 0,
  contracts: 0,
  representation: 0,
  ...partial,
});

describe('classifyRecovery', () => {
  it('a player with no Transfermarkt id and no payloads is a documented dead end', () => {
    expect(
      classifyRecovery({ tmId: null, rawPayloads: 0, availability: null, after: cover() }),
    ).toBe('NO_SOURCE_AVAILABLE');
  });

  it('a player with no Transfermarkt id but raw payloads goes to a human', () => {
    expect(
      classifyRecovery({ tmId: null, rawPayloads: 2, availability: null, after: cover() }),
    ).toBe('MANUAL_REVIEW');
  });

  it('an anchored player the dataset does not know goes to a human, not to RECOVERED', () => {
    // Trivially "source-complete" against an empty source would be the lie
    // the state machine exists to prevent.
    expect(
      classifyRecovery({
        tmId: '999999999',
        rawPayloads: 1,
        availability: { marketValues: 0, transfers: 0, inPlayersTable: false },
        after: cover({ market_values: 3 }),
      }),
    ).toBe('MANUAL_REVIEW');
  });

  it('recovered means source-complete: GBM holds at least what the dataset holds', () => {
    expect(
      classifyRecovery({
        tmId: '423606',
        rawPayloads: 1,
        availability: { marketValues: 19, transfers: 9, inPlayersTable: true },
        after: cover({ market_values: 19, transfers: 9 }),
      }),
    ).toBe('RECOVERED');
  });

  it('rows from other providers can exceed the dataset without breaking RECOVERED', () => {
    expect(
      classifyRecovery({
        tmId: '423606',
        rawPayloads: 1,
        availability: { marketValues: 10, transfers: 4, inPlayersTable: true },
        after: cover({ market_values: 14, transfers: 4 }),
      }),
    ).toBe('RECOVERED');
  });

  it('a single table short of the source is PARTIAL, not RECOVERED', () => {
    expect(
      classifyRecovery({
        tmId: '935094',
        rawPayloads: 3,
        availability: { marketValues: 12, transfers: 5, inPlayersTable: true },
        after: cover({ market_values: 12, transfers: 4 }),
      }),
    ).toBe('PARTIAL');
  });

  it('an id present only in players.csv with empty history tables still classifies against the source', () => {
    // The dataset knows the player but genuinely carries no valuations or
    // transfers: holding zero of zero is source-complete.
    expect(
      classifyRecovery({
        tmId: '1354272',
        rawPayloads: 1,
        availability: { marketValues: 0, transfers: 0, inPlayersTable: true },
        after: cover(),
      }),
    ).toBe('RECOVERED');
  });
});

describe('the migration speaks the same vocabulary', () => {
  const migration = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../supabase/migrations/20260902120000_merge_recovery_is_tracked_per_player.sql',
    ),
    'utf8',
  );

  it('the check constraint accepts exactly the four attempt states', () => {
    const m = migration.match(/state in \(([^)]+)\)/);
    expect(m).not.toBeNull();
    const constrained = [...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
    expect(constrained).toEqual([...RECOVERY_STATES].sort());
  });

  it('the queue defaults an unattempted survivor to PENDING', () => {
    expect(migration).toMatch(/coalesce\(att\.state, 'PENDING'\)\s+as recovery_state/);
  });

  it('the queue view keeps the recovery queue — nothing here deletes it', () => {
    expect(migration).toContain('create or replace view v_merge_recovery_queue');
    expect(migration).not.toMatch(/drop\s+view/i);
  });

  it('the quality report separates the automatable remainder from human review', () => {
    expect(migration).toContain("'merge_survivors_needing_reingest'");
    expect(migration).toContain("'merge_recovery_manual_review'");
    expect(migration).toMatch(/recovery_state in \('PENDING', 'PARTIAL'\)/);
  });

  it('the audit survives run pruning', () => {
    expect(migration).toMatch(/run_id\s+uuid references ingestion_runs\(id\) on delete set null/);
  });
});
