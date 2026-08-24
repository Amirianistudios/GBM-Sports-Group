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

  it('defaults news source_type to a value the table actually allows', () => {
    // These live in two different migrations, so neither file is wrong on its
    // own and no amount of reading one catches the disagreement. When they
    // drifted, every NEWS submission that omitted source_type was refused with
    // a constraint error instead of being stored.
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const contract = readFileSync(
      join(MIGRATIONS, '20260826120000_intel_submission_contract.sql'),
      'utf8',
    );
    const fallback = contract.match(/coalesce\(v_data->>'source_type', '([A-Z_]+)'\)/);
    expect(fallback, 'the NEWS branch no longer defaults source_type').not.toBeNull();

    // The last migration to define the constraint is the one in force.
    let allowed: string[] | null = null;
    for (const f of files) {
      const m = readFileSync(join(MIGRATIONS, f), 'utf8').match(
        /check\s*\(source_type in \(([^)]*)\)\)/i,
      );
      if (m) allowed = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    }
    expect(allowed, 'no CHECK on player_news.source_type found').not.toBeNull();

    expect(
      allowed,
      `gbm_intel_submit() defaults source_type to '${fallback![1]}', which the CHECK does not ` +
        `allow. Every NEWS submission omitting the field would be rejected.`,
    ).toContain(fallback![1]);
  });

  it('gives news and social media a source_type of their own', () => {
    // The brief's third responsibility area is news and social monitoring.
    // Without these, a newspaper report has to be filed as 'RSS' and a post as
    // 'MANUAL', which records the transport and loses the source.
    for (const value of ['NEWS_MEDIA', 'SOCIAL']) {
      expect(sql, `no source_type for ${value}`).toContain(`'${value}'`);
    }
  });

  describe('a minimal payload survives every branch', () => {
    /**
     * Three separate submissions were refused by the same mistake: naming a
     * column in an INSERT and handing it NULL, when the column is NOT NULL and
     * has a DEFAULT. Postgres does not fall back to the default in that case —
     * it raises — so the branch worked whenever the optional field happened to
     * be present and failed on the ordinary payload that omitted it.
     *
     * Each of these pins one such column to a coalesce. The migrations carry
     * the same assertions against the live definition; these fail earlier, on
     * the diff, before anything reaches the database.
     */
    const fn = latestSubmitFunction();

    it.each([
      ['player_season_stats.advanced', /coalesce\(v_data->'advanced', '\{\}'::jsonb\)/],
      ['source_facts.confidence', /coalesce\(\(v_data->>'confidence'\)::numeric, 0\.800\)/],
      ['player_news.source_type', /coalesce\(v_data->>'source_type', '[A-Z_]+'\)/],
      ['player_news.content_hash', /coalesce\(v_data->>'content_hash',/],
      ['intel_reports.sections', /coalesce\(v_data->'sections', '\[\]'::jsonb\)/],
      ['intel_reports.sources', /coalesce\(v_data->'sources', '\[\]'::jsonb\)/],
    ])('supplies a value for %s when the payload omits it', (column, pattern) => {
      expect(
        pattern.test(fn),
        `${column} is NOT NULL with a default, but the submit function can pass it NULL. ` +
          `Every submission omitting that field would be rejected.`,
      ).toBe(true);
    });

    it('does not let a model count as a source that agrees or disagrees', () => {
      // AI assertions land in source_facts alongside providers. If the
      // conflicts view counts them, a model repeating Transfermarkt turns one
      // source into two on the corroboration stripe, and a model getting it
      // wrong shows as Transfermarkt disagreeing with itself.
      const files = readdirSync(MIGRATIONS)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      let view: string | null = null;
      for (const f of files) {
        const text = readFileSync(join(MIGRATIONS, f), 'utf8');
        const start = text.indexOf('create or replace view player_fact_conflicts');
        if (start === -1) continue;
        view = text.slice(start, text.indexOf(';', start));
      }
      expect(view, 'no migration defines player_fact_conflicts').not.toBeNull();
      expect(
        view,
        'player_fact_conflicts counts AI_ASSESSED rows as sources, so a model would ' +
          'corroborate or contradict the site it summarised',
      ).toContain('AI_ASSESSED');
    });

    it('refuses a genuinely required field by name rather than by constraint error', () => {
      // source_name and fact_key are NOT NULL with no default, so there is
      // nothing to fall back to and nothing may be invented — a news item with
      // a made-up source is worse than a rejected one. What the caller must not
      // get is an opaque Postgres constraint message.
      expect(fn).toContain('MISSING_REQUIRED_FIELD');
      for (const field of ['source_name', 'fact_key']) {
        expect(
          new RegExp(`nullif\\(v_data->>'${field}', ''\\) is null`).test(fn),
          `${field} is required but is not checked, so omitting it returns WRITE_FAILED ` +
            `with a Postgres message instead of naming the field`,
        ).toBe(true);
      }
    });
  });
});

/**
 * The newest migration that defines `gbm_intel_submit` holds the definition in
 * force. Reading the newest rather than the first means these tests follow the
 * function as it is replaced, instead of pinning a version that is no longer
 * installed.
 */
function latestSubmitFunction(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let latest: string | null = null;
  for (const f of files) {
    const text = readFileSync(join(MIGRATIONS, f), 'utf8');
    const start = text.indexOf('create or replace function gbm_intel_submit(');
    if (start === -1) continue;
    const end = text.indexOf('end $$;', start);
    latest = text.slice(start, end);
  }

  if (latest === null) throw new Error('no migration defines gbm_intel_submit');
  return latest;
}
