/**
 * Client-side mirror of the database's `gbm_normalize_name()`.
 *
 * Entity matching happens on both sides of the wire: Postgres normalises for
 * its trigram indexes, the importer normalises to reconcile CSV rows against
 * rows already stored. The two MUST agree — if they drift, the importer starts
 * creating duplicate countries and clubs that the database believes are new.
 *
 * Postgres:  lower(unaccent(x)) → non-alphanumeric to space → collapse → null if blank
 */
export function normalizeName(input: string | null | undefined): string | null {
  if (!input) return null;
  const out = input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip combining marks, as unaccent does
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out === '' ? null : out;
}

/** Transfermarkt position strings onto the enum the schema stores. */
export function foot(value: string | null): 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN' {
  switch ((value ?? '').toLowerCase()) {
    case 'left':
      return 'LEFT';
    case 'right':
      return 'RIGHT';
    case 'both':
      return 'BOTH';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Transfermarkt fee fields carry either a number, or one of several textual
 * markers. Those markers are meaningful — a free transfer is not a missing fee
 * — so they are returned alongside the amount rather than discarded.
 */
export function parseFee(raw: string | null): {
  amount: number | null;
  isFree: boolean;
  isLoan: boolean;
  type: string | null;
} {
  const s = (raw ?? '').trim().toLowerCase();
  const none = { amount: null, isFree: false, isLoan: false, type: null };
  if (!s || s === '-' || s === 'na' || s === 'null') return none;

  const numeric = Number.parseFloat(s.replace(/[^0-9.]/g, ''));
  const amount = Number.isFinite(numeric) ? numeric : null;

  if (s.includes('end of loan')) return { amount: null, isFree: false, isLoan: true, type: 'LOAN_RETURN' };
  if (s.includes('loan')) return { amount, isFree: false, isLoan: true, type: 'LOAN' };
  if (s.startsWith('free')) return { amount: 0, isFree: true, isLoan: false, type: 'FREE' };
  if (s === '?' || s === 'unknown') return { amount: null, isFree: false, isLoan: false, type: 'PERMANENT' };

  return { amount, isFree: amount === 0, isLoan: false, type: 'PERMANENT' };
}

/** Transfermarkt profile URL for a player id, used for the "open source" button. */
export function tmPlayerUrl(playerCode: string | null, tmId: string): string {
  const slug = playerCode ?? 'spieler';
  return `https://www.transfermarkt.com/${slug}/profil/spieler/${tmId}`;
}
