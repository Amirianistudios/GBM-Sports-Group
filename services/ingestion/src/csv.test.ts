import { describe, expect, it } from 'vitest';
import { date, int, num, str } from './csv.js';

/**
 * Transfermarkt exports use '', 'NA', 'null' and '-' interchangeably for
 * missing values. Coercing them to null centrally is what keeps NULL in the
 * database meaning "the source did not say" rather than "the parser gave up".
 */
describe('field coercion', () => {
  it('treats every blank marker as null', () => {
    for (const blank of ['', '  ', 'NA', 'n/a', 'null', 'NaN', '-', 'None']) {
      expect(str(blank)).toBeNull();
    }
  });

  it('preserves genuine values and trims them', () => {
    expect(str('  Erling Haaland ')).toBe('Erling Haaland');
    expect(int('194')).toBe(194);
    expect(num('25000000.5')).toBe(25000000.5);
  });

  it('rejects non-numeric input rather than producing NaN', () => {
    expect(int('unknown')).toBeNull();
    expect(num('n/a')).toBeNull();
  });

  it('accepts ISO dates and rejects placeholders', () => {
    expect(date('2000-07-21')).toBe('2000-07-21');
    expect(date('2000-07-21T00:00:00Z')).toBe('2000-07-21');
    expect(date('0000-00-00')).toBeNull();
    expect(date('21/07/2000')).toBeNull();
    expect(date('')).toBeNull();
  });
});
