/**
 * GBM priority selection — which players enter the platform when a cap applies.
 *
 * History: the first staged import ordered by `last_season` desc and sliced.
 * Nearly every active player ties on the current season, and a stable sort
 * then falls back to dataset order — which follows Transfermarkt profile ids,
 * i.e. career start dates. "The 2,000 most recently active" silently became
 * "the 2,000 longest-registered professionals": a database with a median age
 * of 34.5 and twenty-five players under 24.
 *
 * This module replaces that slice with GBM's actual acquisition profile:
 * young players, target-market leagues and citizenships, realistic value
 * bands, contract windows. The weights are selection priority for import —
 * not a scouting verdict; the in-platform opportunity score is computed
 * separately, from ingested facts, by the signals job.
 *
 * The order is a total order (score, then market value, then newest profile
 * id) so re-runs are deterministic and never depend on sort stability again.
 */
import { int, num, str, type Row } from '../csv.js';

/**
 * GBM primary markets by citizenship, as spelled in the dataset
 * (`country_of_citizenship`). Kept sorted for legibility.
 */
export const GBM_TARGET_CITIZENSHIPS: ReadonlySet<string> = new Set([
  // Europe
  'Albania',
  'Armenia',
  'Azerbaijan',
  'Belgium',
  'Bosnia-Herzegovina',
  'Bulgaria',
  'Croatia',
  'Czech Republic',
  'Estonia',
  'Georgia',
  'Latvia',
  'Lithuania',
  'Moldova',
  'Montenegro',
  'North Macedonia',
  'Poland',
  'Romania',
  'Serbia',
  'Slovakia',
  'Slovenia',
  'Ukraine',
  // Central Asia
  'Kazakhstan',
  'Uzbekistan',
  // Asia
  'Japan',
  'Korea, South',
  // South America
  'Argentina',
  'Bolivia',
  'Brazil',
  'Colombia',
  'Ecuador',
  'Paraguay',
  'Uruguay',
  // Africa
  "Cote d'Ivoire",
  'Egypt',
  'Ghana',
  'Morocco',
  'Nigeria',
  'Rwanda',
  'Senegal',
  'South Africa',
]);

/**
 * Target-market countries whose top division the dataset actually covers
 * (verified against competitions.csv). Georgia, Armenia and most African
 * leagues are not in this dataset — players from those markets are captured
 * through citizenship instead, wherever in the covered leagues they play.
 */
export const GBM_TARGET_LEAGUE_COUNTRIES: ReadonlySet<string> = new Set([
  'Argentina',
  'Belgium',
  'Brazil',
  'Croatia',
  'Czech Republic',
  'Japan',
  'Korea, South',
  'Poland',
  'Romania',
  'Serbia',
  'Ukraine',
]);

export interface SelectionContext {
  /** competition_id → country_name, from the dataset's competitions table. */
  competitionCountry: ReadonlyMap<string, string>;
  /** Selection date; injected so runs are reproducible in tests. */
  today: Date;
}

function ageAt(dob: string | null, today: Date): number | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  return (today.getTime() - t) / (365.25 * 24 * 3600 * 1000);
}

function isoDaysFrom(today: Date, days: number): string {
  return new Date(today.getTime() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Priority of one dataset row for a capped import. Pure; higher is better.
 * Age dominates by design: an agency builds around players whose careers are
 * still ahead of them.
 */
export function gbmPriority(row: Row, ctx: SelectionContext): number {
  let s = 0;

  const age = ageAt(str(row.date_of_birth), ctx.today);
  if (age === null) s += 8; // unknown DOB: usually a lower-league youth profile
  else if (age < 21) s += 40;
  else if (age < 24) s += 34;
  else if (age < 27) s += 22;
  else if (age < 30) s += 10;
  else if (age < 33) s += 2;

  const compId = str(row.current_club_domestic_competition_id);
  const leagueCountry = compId ? ctx.competitionCountry.get(compId) : undefined;
  if (leagueCountry && GBM_TARGET_LEAGUE_COUNTRIES.has(leagueCountry)) s += 25;

  const citizenship = str(row.country_of_citizenship);
  if (citizenship && GBM_TARGET_CITIZENSHIPS.has(citizenship)) s += 20;

  const value = num(row.market_value_in_eur);
  if (value === null || value < 50_000) s += 6; // unknown ≠ uninteresting
  else if (value <= 5_000_000) s += 15; // realistic acquisition range
  else if (value <= 10_000_000) s += 8;
  else s += 2; // established stars: context, not targets

  const contractEnd = str(row.contract_expiration_date)?.slice(0, 10);
  if (
    contractEnd &&
    contractEnd >= isoDaysFrom(ctx.today, -90) &&
    contractEnd <= isoDaysFrom(ctx.today, 548)
  ) {
    s += 6; // expiring within ~18 months: the window agencies act in
  }

  const caps = int(row.international_caps);
  if (caps !== null && caps > 0) s += 3;

  return s;
}

/**
 * Deterministic capped selection. Rows whose `last_season` is older than
 * `today`'s year minus one are dropped first: a capped import must never
 * spend a slot on a player who is no longer playing.
 */
export function selectPlayers(rows: Row[], max: number, ctx: SelectionContext): Row[] {
  const activeSince = ctx.today.getFullYear() - 1;
  const scored = rows
    .filter((r) => (int(r.last_season) ?? 0) >= activeSince)
    .map((r) => ({
      r,
      score: gbmPriority(r, ctx),
      value: num(r.market_value_in_eur) ?? -1,
      id: int(r.player_id) ?? 0,
    }));

  scored.sort((a, b) => b.score - a.score || b.value - a.value || b.id - a.id);
  return scored.slice(0, max).map((s) => s.r);
}
