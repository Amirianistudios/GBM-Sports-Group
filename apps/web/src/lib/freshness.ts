/**
 * How old is this, and may we call it live?
 *
 * The platform mixes four cadences — an hourly job, daily statistics, a weekly
 * market dataset, and knowledge a person typed in. Presenting them
 * identically would be the most damaging kind of dishonesty here: an agent
 * acting on a "current" club that a provider last confirmed in July.
 *
 * So freshness is computed, never asserted. Only something checked within the
 * last two hours may be described as live; everything else states its age or
 * its source date, and something never checked says exactly that.
 */

export type Cadence = 'live' | 'daily' | 'weekly' | 'manual';

export interface Freshness {
  /** Human sentence: "Updated 17 min ago", "Checked 3 days ago". */
  label: string;
  /** True only within the live window — gates any "Live" wording. */
  isLive: boolean;
  /** Minutes since the timestamp, or null when never checked. */
  ageMinutes: number | null;
}

const MIN = 60_000;
const LIVE_WINDOW_MINUTES = 120;

function ago(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} ago`;
  const months = days / 30.44;
  return `${Math.round(months)} month${Math.round(months) === 1 ? '' : 's'} ago`;
}

/**
 * `format` lets a caller supply localised wording. It receives the elapsed
 * time already rendered as a phrase and returns the finished sentence, so a
 * language that puts "checked" after the duration — or inflects it — can do
 * so instead of receiving two fragments to glue together.
 */
export interface FreshnessOptions {
  verb?: string;
  never?: string;
  format?: (elapsed: string) => string;
  /** Localised elapsed-time wording; defaults to the English `ago()`. */
  elapsed?: (minutes: number) => string;
}

export function freshness(
  timestamp: string | null | undefined,
  opts: FreshnessOptions = {},
): Freshness {
  const verb = opts.verb ?? 'Checked';
  const never = opts.never ?? 'Never checked';
  const elapsed = opts.elapsed ?? ago;
  const format = opts.format ?? ((e: string) => `${verb} ${e}`);

  if (!timestamp) return { label: never, isLive: false, ageMinutes: null };
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return { label: never, isLive: false, ageMinutes: null };

  const ageMinutes = (Date.now() - t) / MIN;
  return {
    label: format(elapsed(ageMinutes)),
    isLive: ageMinutes <= LIVE_WINDOW_MINUTES,
    ageMinutes,
  };
}

/**
 * A dated fact from a periodic source — a market valuation, a weekly dataset.
 * These are never "live" however recent, because their source only moves on
 * its own schedule; saying "updated 2 minutes ago" about a value the provider
 * set in July would be a lie about the fact, not about our copy of it.
 */
export function sourceDated(date: string | null | undefined, sourceLabel: string): string {
  if (!date) return `${sourceLabel}: no date recorded`;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return `${sourceLabel}: no date recorded`;
  return `${sourceLabel}: source updated ${d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

/** Wording for a whole surface, so sections do not each invent their own. */
export const CADENCE_NOTE: Record<Cadence, string> = {
  live: 'Checked hourly for portfolio and priority players',
  daily: 'Season statistics refresh with the provider dataset',
  weekly: 'Market values move on the provider’s own schedule, not ours',
  manual: 'Recorded by GBM staff',
};
