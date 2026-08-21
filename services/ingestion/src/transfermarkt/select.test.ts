import { describe, expect, it } from 'vitest';
import type { Row } from '../csv.js';
import { gbmPriority, selectPlayers, type SelectionContext } from './select.js';

/**
 * The selection is the platform's front door: these tests pin the acquisition
 * profile (young, target markets, realistic values) and the determinism that
 * the original last_season sort lacked — that bug produced a database with a
 * median age of 34.5.
 */

const TODAY = new Date('2026-08-21T00:00:00Z');

function ctx(compCountry: Record<string, string> = { BE1: 'Belgium', GB1: 'England' }): SelectionContext {
  return { competitionCountry: new Map(Object.entries(compCountry)), today: TODAY };
}

function row(overrides: Partial<Record<string, string>> = {}): Row {
  return {
    player_id: '900000',
    last_season: '2025',
    date_of_birth: '1999-03-10',
    country_of_citizenship: 'France',
    current_club_domestic_competition_id: 'GB1',
    market_value_in_eur: '2000000',
    contract_expiration_date: '',
    international_caps: '',
    ...overrides,
  };
}

describe('gbmPriority', () => {
  it('ranks a 19-year-old far above a 34-year-old, all else equal', () => {
    const young = gbmPriority(row({ date_of_birth: '2007-05-01' }), ctx());
    const veteran = gbmPriority(row({ date_of_birth: '1992-05-01' }), ctx());
    expect(young).toBeGreaterThan(veteran + 30);
  });

  it('gives unknown birth dates a modest score, not zero and not youth-level', () => {
    const unknown = gbmPriority(row({ date_of_birth: '' }), ctx());
    const veteran = gbmPriority(row({ date_of_birth: '1992-05-01' }), ctx());
    const young = gbmPriority(row({ date_of_birth: '2007-05-01' }), ctx());
    expect(unknown).toBeGreaterThan(veteran);
    expect(unknown).toBeLessThan(young);
  });

  it('rewards target-market leagues via the competition country map', () => {
    const belgium = gbmPriority(row({ current_club_domestic_competition_id: 'BE1' }), ctx());
    const england = gbmPriority(row({ current_club_domestic_competition_id: 'GB1' }), ctx());
    expect(belgium - england).toBe(25);
  });

  it('rewards target citizenship', () => {
    const georgian = gbmPriority(row({ country_of_citizenship: 'Georgia' }), ctx());
    const french = gbmPriority(row({ country_of_citizenship: 'France' }), ctx());
    expect(georgian - french).toBe(20);
  });

  it('prefers the realistic value band over superstar valuations', () => {
    const realistic = gbmPriority(row({ market_value_in_eur: '300000' }), ctx());
    const superstar = gbmPriority(row({ market_value_in_eur: '80000000' }), ctx());
    expect(realistic).toBeGreaterThan(superstar);
  });

  it('rewards a contract expiring inside the 18-month window', () => {
    const closing = gbmPriority(row({ contract_expiration_date: '2027-06-30' }), ctx());
    const distant = gbmPriority(row({ contract_expiration_date: '2030-06-30' }), ctx());
    expect(closing - distant).toBe(6);
  });

  it('rewards senior international experience', () => {
    const capped = gbmPriority(row({ international_caps: '12' }), ctx());
    const uncapped = gbmPriority(row({ international_caps: '0' }), ctx());
    expect(capped - uncapped).toBe(3);
  });
});

describe('selectPlayers', () => {
  it('drops players whose last season predates today minus one year', () => {
    const rows = [
      row({ player_id: '1', last_season: '2023', date_of_birth: '2007-01-01' }),
      row({ player_id: '2', last_season: '2025', date_of_birth: '1990-01-01' }),
    ];
    const picked = selectPlayers(rows, 10, ctx());
    expect(picked.map((r) => r.player_id)).toEqual(['2']);
  });

  it('is deterministic regardless of input order (the stable-sort regression)', () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row({
        player_id: String(1000 + i),
        date_of_birth: i % 2 ? '2004-01-01' : '1991-01-01',
        market_value_in_eur: String(100000 * ((i % 7) + 1)),
      }),
    );
    const shuffled = [...rows].reverse();
    const a = selectPlayers(rows, 50, ctx()).map((r) => r.player_id);
    const b = selectPlayers(shuffled, 50, ctx()).map((r) => r.player_id);
    expect(a).toEqual(b);
  });

  it('breaks score ties by market value, then by newest profile id', () => {
    const rows = [
      row({ player_id: '100', market_value_in_eur: '200000' }),
      row({ player_id: '300', market_value_in_eur: '400000' }),
      row({ player_id: '200', market_value_in_eur: '400000' }),
    ];
    const picked = selectPlayers(rows, 3, ctx());
    expect(picked.map((r) => r.player_id)).toEqual(['300', '200', '100']);
  });

  it('fills a cap with the young target-market profile first', () => {
    const rows = [
      row({ player_id: '1', date_of_birth: '1991-01-01', market_value_in_eur: '90000000' }),
      row({
        player_id: '2',
        date_of_birth: '2006-04-01',
        country_of_citizenship: 'Georgia',
        current_club_domestic_competition_id: 'BE1',
        market_value_in_eur: '400000',
      }),
      row({ player_id: '3', date_of_birth: '1993-01-01' }),
    ];
    const picked = selectPlayers(rows, 1, ctx());
    expect(picked[0].player_id).toBe('2');
  });
});
