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
