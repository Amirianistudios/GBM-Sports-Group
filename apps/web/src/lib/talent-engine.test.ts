/**
 * The B2 talent engine's contract, pinned three ways:
 *
 *   1. the per-90 arithmetic (the interface half of the formula the SQL
 *      engine also implements),
 *   2. the new methodology's rules as written in migration 0051,
 *   3. the REGRESSION the brief demanded: the old methodology (captured
 *      verbatim in migration 0043) must FAIL the new cohort rules. If someone
 *      "simplifies" 0051 back toward the old parameters, these tests name
 *      exactly which rule died.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  MIN_MINUTES_FOR_RATES,
  PREFERRED_MINUTES,
  goalContributionsPer90,
  per90,
  rateConfidence,
} from './per90';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations');
const read = (name: string) => readFileSync(resolve(MIGRATIONS, name), 'utf8');

const newEngine = read('20260902160000_percentiles_earn_their_cohorts.sql');
const oldCapture = read('20260901130000_capture_the_out_of_band_objects.sql');
/** The old methodology's body, as captured from production. */
const oldEngine = oldCapture.slice(
  oldCapture.indexOf('claude_compute_percentiles'),
  oldCapture.indexOf('$$;', oldCapture.indexOf('claude_compute_percentiles')),
);

describe('per90', () => {
  it('computes a rate over the minutes actually played', () => {
    expect(per90(9, 1800)).toBe(0.45);
    expect(per90(0, 900)).toBe(0);
  });

  it('refuses a rate below the minutes floor — an anecdote is not a rate', () => {
    expect(per90(3, MIN_MINUTES_FOR_RATES - 1)).toBeNull();
    expect(per90(3, 90)).toBeNull();
    expect(per90(3, 0)).toBeNull();
  });

  it('propagates unknowns instead of inventing zeroes', () => {
    expect(per90(null, 1800)).toBeNull();
    expect(per90(undefined, 1800)).toBeNull();
    expect(per90(3, null)).toBeNull();
  });

  it('goal contributions needs both inputs known', () => {
    expect(goalContributionsPer90(5, 4, 1800)).toBe(0.45);
    expect(goalContributionsPer90(5, null, 1800)).toBeNull();
    expect(goalContributionsPer90(null, 4, 1800)).toBeNull();
  });

  it('confidence follows the same floors as the cohorts', () => {
    expect(rateConfidence(PREFERRED_MINUTES)).toBe('HIGH');
    expect(rateConfidence(MIN_MINUTES_FOR_RATES)).toBe('MEDIUM');
    expect(rateConfidence(MIN_MINUTES_FOR_RATES - 1)).toBeNull();
    expect(rateConfidence(null)).toBeNull();
  });
});

describe('the new methodology, as written in 0051', () => {
  it('uses the eight position families, never the four coarse buckets', () => {
    for (const family of ['GK', 'CB', 'FB_WB', 'DM', 'CM', 'AM', 'WINGER', 'STRIKER']) {
      expect(newEngine).toContain(`'${family}'`);
    }
  });

  it('refuses to guess a family from a coarse label', () => {
    // "Defender"/"Midfielder"/"Forward" must fall to the NULL branch —
    // they appear only in the comment explaining why, never in a mapping arm.
    expect(newEngine).toMatch(/else null/);
    expect(newEngine).not.toMatch(/when p_position = 'Defender'/);
    expect(newEngine).not.toMatch(/when p_position = 'Midfielder'/);
    expect(newEngine).not.toMatch(/when p_position = 'Forward'/);
  });

  it('enforces the 450-minute individual floor and the 30-player cohort floor', () => {
    expect(newEngine).toMatch(/minutes >= 450/);
    expect(newEngine).toMatch(/cohort_n >= 30/);
    expect(newEngine).toMatch(/all_n >= 30/);
  });

  it('versions everything and records the cohort used', () => {
    expect(newEngine).toContain("'POSITION_PERCENTILE_V1'");
    expect(newEngine).toContain("'GBM_PERFORMANCE_V1'");
    expect(newEngine).toContain("'GBM_DEVELOPMENT_V1'");
    expect(newEngine).toMatch(/jsonb_build_object\('family', family, 'season', season_name/);
  });

  it('leaves the old model in place rather than deleting it', () => {
    expect(newEngine).not.toMatch(/delete from player_percentiles\s+where peer_group like 'CLAUDE/i);
    // and the guard asserts the CLAUDE rows are untouched.
    expect(newEngine).toContain("peer_group like 'CLAUDE:%'");
  });

  it('separates performance from role fit, opportunity and transition by name', () => {
    expect(newEngine).toContain("'PERFORMANCE_SCORE'");
    // The score never multiplies competition strength into the number —
    // strength appears only as the cohort band.
    expect(newEngine).not.toMatch(/percentile\s*\*\s*strength/i);
    expect(newEngine).not.toMatch(/strength_rating\s*\*/);
  });

  it('gates BREAKTHROUGH on age as context, and keeps INSUFFICIENT_HISTORY honest', () => {
    expect(newEngine).toMatch(/age_years < 23 and delta >= 0\.25/);
    expect(newEngine).toContain("'INSUFFICIENT_HISTORY'");
  });
});

describe('REGRESSION: the old methodology fails the new cohort rules', () => {
  it('captured the old engine to compare against', () => {
    expect(oldEngine.length).toBeGreaterThan(500);
  });

  it('old cohorts were GK|DEF|MID|FWD — coarser than the eight families', () => {
    expect(oldEngine).toMatch(/GK|DEF|MID|FWD/);
    // The old grouping cannot express a family the new rules require:
    expect(oldEngine).not.toContain('FB_WB');
    expect(oldEngine).not.toContain('WINGER');
  });

  it('old minimum cohort was 8 — below the new floor of 30', () => {
    const m = oldEngine.match(/grp_n\s*>=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(30);
  });

  it('old minutes floor was 300 — below the new floor of 450', () => {
    const m = oldEngine.match(/p_min_minutes\s+integer\s+default\s+(\d+)/i) ??
      oldEngine.match(/default\s+(\d+)\s*\)/i);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(450);
  });

  it('old runs deleted their predecessors; the new model never silently overwrites a version', () => {
    expect(oldEngine).toMatch(/delete from player_percentiles/i);
    // New: deletion is scoped to the SAME model_version's stale rows only.
    expect(newEngine).toMatch(/delete from player_percentiles\s+where model_version = v_model/);
  });
});
