import { describe, expect, it } from 'vitest';
import { foot, normalizeName, parseFee, tmPlayerUrl } from './normalize.js';

/**
 * normalizeName is a client-side mirror of the database's gbm_normalize_name().
 * If the two drift, the importer stops recognising entities the database
 * already holds and starts inserting duplicates — so these cases pin the
 * contract rather than merely exercising the code.
 */
describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName("Cote d'Ivoire")).toBe('cote d ivoire');
    expect(normalizeName('Bosnia-Herzegovina')).toBe('bosnia herzegovina');
  });

  it('removes diacritics the way unaccent does', () => {
    expect(normalizeName('Türkiye')).toBe('turkiye');
    expect(normalizeName('Grzegorz Krychowiak')).toBe('grzegorz krychowiak');
    expect(normalizeName('João Félix')).toBe('joao felix');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeName('  Real   Madrid  ')).toBe('real madrid');
  });

  it('returns null for empty and punctuation-only input', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName(null)).toBeNull();
    expect(normalizeName('---')).toBeNull();
  });
});

describe('foot', () => {
  it('maps the source vocabulary onto the enum', () => {
    expect(foot('left')).toBe('LEFT');
    expect(foot('Right')).toBe('RIGHT');
    expect(foot('both')).toBe('BOTH');
  });

  it('treats anything unrecognised as UNKNOWN rather than guessing', () => {
    expect(foot(null)).toBe('UNKNOWN');
    expect(foot('')).toBe('UNKNOWN');
    expect(foot('either')).toBe('UNKNOWN');
  });
});

describe('parseFee', () => {
  it('distinguishes a free transfer from a missing fee', () => {
    expect(parseFee('free transfer')).toMatchObject({ amount: 0, isFree: true, type: 'FREE' });
    expect(parseFee('')).toMatchObject({ amount: null, isFree: false, type: null });
    expect(parseFee('?')).toMatchObject({ amount: null, type: 'PERMANENT' });
  });

  it('recognises loans and loan returns', () => {
    expect(parseFee('end of loan')).toMatchObject({ isLoan: true, type: 'LOAN_RETURN' });
    expect(parseFee('loan transfer')).toMatchObject({ isLoan: true, type: 'LOAN' });
  });

  it('extracts a numeric fee', () => {
    expect(parseFee('25000000').amount).toBe(25000000);
    expect(parseFee('1500000.50').amount).toBe(1500000.5);
  });
});

describe('tmPlayerUrl', () => {
  it('builds a profile link from the player code', () => {
    expect(tmPlayerUrl('erling-haaland', '418560')).toBe(
      'https://www.transfermarkt.com/erling-haaland/profil/spieler/418560',
    );
  });
});
