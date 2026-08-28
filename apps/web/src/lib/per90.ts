/**
 * Per-90 arithmetic — the one formula, in one place.
 *
 * The SQL engine (migration 0051) computes per-90 values the same way; this
 * module exists so interface code never reimplements the division badly (the
 * classic failures: dividing by zero minutes, or quoting a rate for a player
 * with 90 minutes of football as if it meant something). The 450-minute floor
 * here is the same floor the percentile cohorts enforce.
 */

/** Below this, a per-90 rate is an anecdote, not a rate. */
export const MIN_MINUTES_FOR_RATES = 450;

/** Minutes from which a rate is considered settled (confidence HIGH). */
export const PREFERRED_MINUTES = 900;

/**
 * A per-90 rate, or null when the minutes cannot honestly support one.
 * Nulls propagate: unknown inputs never become a zero rate, because "did not
 * record any" and "we do not know" are different facts.
 */
export function per90(
  count: number | null | undefined,
  minutes: number | null | undefined,
  minMinutes: number = MIN_MINUTES_FOR_RATES,
): number | null {
  if (count === null || count === undefined) return null;
  if (minutes === null || minutes === undefined || minutes < minMinutes) return null;
  return Math.round((count * 90 * 1000) / minutes) / 1000;
}

/** Goals + assists per 90 — the robust output measure the trend engine uses. */
export function goalContributionsPer90(
  goals: number | null | undefined,
  assists: number | null | undefined,
  minutes: number | null | undefined,
): number | null {
  if (goals === null || goals === undefined || assists === null || assists === undefined) {
    return null;
  }
  return per90(goals + assists, minutes);
}

export type RateConfidence = 'HIGH' | 'MEDIUM' | null;

/** How much to trust a rate, from minutes alone (cohort size is the other half). */
export function rateConfidence(minutes: number | null | undefined): RateConfidence {
  if (minutes === null || minutes === undefined || minutes < MIN_MINUTES_FOR_RATES) return null;
  return minutes >= PREFERRED_MINUTES ? 'HIGH' : 'MEDIUM';
}
