/** Shared formatting helpers. Football data has its own conventions. */

export function formatCurrency(value: number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined) return '—';
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${symbol}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;
  }
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
  return `${symbol}${value}`;
}

export function formatAge(dateOfBirth: string | null | undefined): string {
  if (!dateOfBirth) return '—';
  const dob = new Date(dateOfBirth);
  const diff = Date.now() - dob.getTime();
  return (diff / 31_557_600_000).toFixed(1);
}

export function ageYears(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  return (Date.now() - new Date(dateOfBirth).getTime()) / 31_557_600_000;
}

/** Compact position codes — teamsheet vernacular, not prose. */
const POSITION_CODES: Record<string, string> = {
  Goalkeeper: 'GK',
  'Centre-Back': 'CB',
  'Left-Back': 'LB',
  'Right-Back': 'RB',
  'Defensive Midfield': 'DM',
  'Central Midfield': 'CM',
  'Attacking Midfield': 'AM',
  'Left Midfield': 'LM',
  'Right Midfield': 'RM',
  'Left Winger': 'LW',
  'Right Winger': 'RW',
  'Centre-Forward': 'CF',
  'Second Striker': 'SS',
  Attack: 'FW',
  Defender: 'DF',
  Midfield: 'MF',
};

export function positionCode(position: string | null | undefined): string {
  if (!position) return '—';
  return POSITION_CODES[position] ?? position.slice(0, 3).toUpperCase();
}

export function footLabel(foot: string | null | undefined): string {
  switch (foot) {
    case 'LEFT': return 'L';
    case 'RIGHT': return 'R';
    case 'BOTH': return 'L/R';
    default: return '—';
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function monthsUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / (30.44 * 86_400_000));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;
}

/** Per-90 rate. NULL means "under the minutes floor", shown as an em dash. */
export function formatPer90(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(2);
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toLocaleString('en-GB')}'`;
}

/**
 * The shortlist workflow vocabulary. The column is free text in the schema;
 * this list is the application-level contract, ordered as a pipeline.
 */
export const WATCHLIST_STATUSES = [
  'DISCOVERED',
  'MONITORING',
  'SCOUT_REQUESTED',
  'HIGH_PRIORITY',
  'CONTACTED',
  'NEGOTIATING',
  'REJECTED',
  'ARCHIVED',
  'REPRESENTED_BY_GBM',
] as const;

export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return status.replaceAll('_', ' ').toLowerCase();
}

/** Badge class per workflow stage — colour only where state genuinely differs. */
export function watchlistStatusClass(status: string | null | undefined): string {
  switch (status) {
    case 'HIGH_PRIORITY':
    case 'SCOUT_REQUESTED':
      return 'badge badge-attention';
    case 'REPRESENTED_BY_GBM':
    case 'NEGOTIATING':
    case 'CONTACTED':
      return 'badge badge-verified';
    default:
      return 'badge badge-neutral';
  }
}

/**
 * Presentation labels for the dataset's competition slugs ("ligue-1",
 * "laliga"). Display transform only — filters and queries always use the raw
 * stored value. Unknown slugs title-case deterministically.
 */
const LEAGUE_LABELS: Record<string, string> = {
  'premier-league': 'Premier League',
  laliga: 'LaLiga',
  bundesliga: 'Bundesliga',
  'serie-a': 'Serie A',
  'ligue-1': 'Ligue 1',
  'liga-portugal': 'Liga Portugal',
  'liga-portugal-bwin': 'Liga Portugal',
  eredivisie: 'Eredivisie',
  'super-lig': 'Süper Lig',
  'jupiler-pro-league': 'Pro League',
  'premier-liga': 'Premier Liga',
  'uefa-champions-league': 'Champions League',
  'uefa-europa-league': 'Europa League',
  'europa-league': 'Europa League',
  'uefa-conference-league': 'Conference League',
  'copa-del-rey': 'Copa del Rey',
  'fa-cup': 'FA Cup',
  'efl-cup': 'EFL Cup',
  'dfb-pokal': 'DFB-Pokal',
  'coppa-italia': 'Coppa Italia',
  'coupe-de-france': 'Coupe de France',
  'world-cup': 'World Cup',
  supercopa: 'Supercopa',
  'saudi-pro-league': 'Saudi Pro League',
  'major-league-soccer': 'MLS',
};

export function leagueLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  if (LEAGUE_LABELS[slug]) return LEAGUE_LABELS[slug];
  if (!/^[a-z0-9-]+$/.test(slug)) return slug; // already a display name
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Discovery-signal vocabulary, humanized. Unknown types fall back legibly. */
const SIGNAL_LABELS: Record<string, string> = {
  RAPID_VALUE_GROWTH: 'Rapid value growth',
  CONTRACT_EXPIRING: 'Contract expiring',
  BREAKOUT_MINUTES: 'Breakout minutes',
  UNDERVALUED_PERFORMER: 'Undervalued performer',
  YOUNG_HIGH_VALUE: 'Young high value',
};

export function signalLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return SIGNAL_LABELS[type] ?? statusLabel(type);
}

/** Trend arrow + class for a 12-month value change. Glyph AND colour, never colour alone. */
export function trend(pct: number | null | undefined): { glyph: string; className: string; text: string } | null {
  if (pct === null || pct === undefined) return null;
  const n = Number(pct);
  if (n > 0.5) return { glyph: '▲', className: 'trend-up', text: `+${n.toFixed(0)}%` };
  if (n < -0.5) return { glyph: '▼', className: 'trend-down', text: `${n.toFixed(0)}%` };
  return { glyph: '▬', className: 'trend-flat', text: '0%' };
}

/** Contract runway phrasing: "18 mo" style, attention under 18 months. */
export function contractRunway(months: number | null | undefined): { text: string; urgent: boolean } | null {
  if (months === null || months === undefined) return null;
  const m = Number(months);
  if (m <= 0) return { text: 'expired', urgent: true };
  return { text: `${m} mo left`, urgent: m <= 18 };
}
