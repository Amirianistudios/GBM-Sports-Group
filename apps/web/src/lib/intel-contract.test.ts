import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The external-intelligence integration rests on a handful of decisions that
 * are easy to undo by accident, because undoing them makes something work
 * rather than break. These tests pin the ones that would cause quiet harm:
 *
 *   · If the AI provider's priority is raised above a real source, a model's
 *     summary starts overriding the site it summarised, and nothing errors.
 *   · If the submission function stops being the only door — if a future
 *     migration grants an agent direct INSERT — the contract stops being a
 *     contract.
 *   · If AI output is written into `scouting_reports`, a model's opinion is
 *     counted as a scout's observation, which is the one thing CLAUDE.md says
 *     must never happen.
 *
 * They read the migrations rather than the database, so they fail in CI on the
 * change itself rather than after it has been applied to production.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function migrationText(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

/** Priorities the ladder depends on, read from the provider seed statements. */
const PRIMARY_SOURCE_FLOOR = 50;

describe('external intelligence contract', () => {
  const sql = migrationText();

  it('registers the AI research team as a provider', () => {
    expect(sql).toContain("'AVENGERS_GROK'");
    expect(sql).toContain('AI_RESEARCH');
  });

  it('ranks the AI provider below every primary source it can cite', () => {
    // The seed inserts code, name, kind, default_priority in that order.
    const match = sql.match(/'AVENGERS_GROK',\s*'[^']*',\s*'AI_RESEARCH',\s*(\d+)/);
    expect(match, 'AVENGERS_GROK provider row not found in any migration').not.toBeNull();

    const priority = Number(match![1]);
    expect(
      priority,
      `AVENGERS_GROK is at priority ${priority}. Above ${PRIMARY_SOURCE_FLOOR} it can outrank a ` +
        `real source, which would let a model's summary override the site it summarised.`,
    ).toBeLessThan(PRIMARY_SOURCE_FLOOR);
  });

  it('gives AI-derived assertions their own fact state', () => {
    // Without this an AI conclusion has to borrow SOURCE_REPORTED and becomes
    // indistinguishable from something a provider actually published.
    expect(sql).toContain("add value if not exists 'AI_ASSESSED'");
  });

  it('never writes AI output into the human scouting tables', () => {
    const contract = readFileSync(
      join(MIGRATIONS, '20260826120000_intel_submission_contract.sql'),
      'utf8',
    );
    for (const table of ['scouting_reports', 'scout_player_ratings', 'scouting_report_sections']) {
      expect(
        contract.includes(`into ${table}`),
        `the submission function writes ${table}; a model's view must never be stored as a scout's`,
      ).toBe(false);
    }
  });

  it('never writes the canonical record directly', () => {
    const contract = readFileSync(
      join(MIGRATIONS, '20260826120000_intel_submission_contract.sql'),
      'utf8',
    );
    // Claims about these go to source_facts as assertions, where
    // provider_fact_priority decides what is displayed.
    for (const table of ['players', 'clubs', 'contracts', 'market_values', 'representation_records']) {
      expect(
        contract.includes(`insert into ${table} `),
        `the submission function inserts into ${table}; claims about the canonical record must ` +
          `become source_facts assertions, not direct writes`,
      ).toBe(false);
    }
  });

  it('grants the agent no table writes — the function is the only door', () => {
    // A grant would let PostgREST expose the table directly and bypass every
    // validation and the idempotency ledger.
    const grants = sql.match(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/gi) ?? [];
    expect(grants, `unexpected write grants to authenticated:\n${grants.join('\n')}`).toEqual([]);
  });

  it('keeps the submission ledger unique per agent and key, so retries are safe', () => {
    expect(sql).toContain('unique (agent_id, submission_key)');
  });
});
