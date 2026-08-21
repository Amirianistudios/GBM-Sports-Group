import { describe, expect, it } from 'vitest';
import { buildIntelligenceSummary, type SummaryInput } from './summary';

/**
 * The summary is the most-read sentence in the product, so these tests pin
 * its honesty: every clause traceable to an input field, the representation
 * caveat verbatim, nothing when identity is unknown, and no scouting
 * adjectives the data cannot support.
 */

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    age: 19.4,
    nationality: 'Georgia',
    position: 'Centre-Back',
    clubName: 'KAA Gent',
    leagueName: 'Belgian Pro League',
    seasonMinutes: 1420,
    seasonApps: 18,
    marketValue: 800_000,
    valueChangePct: 60,
    contractMonths: 14,
    citizenshipIsTarget: true,
    leagueIsTarget: true,
    noAgencyListed: false,
    ...overrides,
  };
}

describe('buildIntelligenceSummary', () => {
  it('opens with age, nationality, position, club and league', () => {
    const s = buildIntelligenceSummary(input())!;
    expect(s).toMatch(/^19-year-old centre-back from Georgia at KAA Gent, playing Belgian Pro League football this season\./);
  });

  it('mentions only clauses backed by input fields', () => {
    const s = buildIntelligenceSummary(input())!;
    expect(s).toContain('regular starter with 1,420′');
    expect(s).toContain('market value up 60% in twelve months');
    expect(s).toContain('14 months remaining');
    // Never scouting adjectives the data cannot support.
    expect(s.toLowerCase()).not.toMatch(/aerial|pace|technique|composure|leadership/);
  });

  it('caps the monitoring clause at three facts', () => {
    const s = buildIntelligenceSummary(input())!;
    // minutes + growth + contract fill the three slots; the value clause must wait.
    expect(s).not.toContain('realistic acquisition range');
  });

  it('says nothing about form when minutes are unknown', () => {
    const s = buildIntelligenceSummary(input({ seasonMinutes: null, seasonApps: null }))!;
    expect(s).not.toContain('starter');
    expect(s).not.toContain('′');
  });

  it('carries the representation caveat verbatim when a source lists no agency', () => {
    const s = buildIntelligenceSummary(input({ noAgencyListed: true }))!;
    expect(s).toContain('a blank field is not proof of no representation');
  });

  it('never mentions representation otherwise', () => {
    const s = buildIntelligenceSummary(input())!;
    expect(s.toLowerCase()).not.toContain('agency');
  });

  it('names the market fit only from the target flags', () => {
    expect(buildIntelligenceSummary(input({ leagueIsTarget: false }))!).toContain(
      'Nationality sits inside GBM’s primary markets.',
    );
    expect(
      buildIntelligenceSummary(input({ citizenshipIsTarget: false, leagueIsTarget: false }))!,
    ).not.toContain('primary markets');
  });

  it('returns null when identity is unknown', () => {
    expect(
      buildIntelligenceSummary(input({ age: null, nationality: null })),
    ).toBeNull();
  });

  it('degrades to identity alone when nothing else is known', () => {
    const s = buildIntelligenceSummary(
      input({
        clubName: null,
        leagueName: null,
        seasonMinutes: null,
        seasonApps: null,
        marketValue: null,
        valueChangePct: null,
        contractMonths: null,
        citizenshipIsTarget: false,
        leagueIsTarget: false,
      }),
    )!;
    expect(s).toBe('19-year-old centre-back from Georgia.');
  });

  it('contains no third-person pronouns', () => {
    for (const variant of [input(), input({ noAgencyListed: true }), input({ contractMonths: 6 })]) {
      const s = buildIntelligenceSummary(variant)!;
      expect(s.toLowerCase()).not.toMatch(/\b(he|him|his|she|her|they|them|their)\b/);
    }
  });
});
