import type { PlayerCardData } from '@/components/player-card';

/**
 * Fast-list plumbing: the discovery surfaces sort and filter on the cached
 * columns of `players` (indexed, 0.1ms at any population size) instead of
 * evaluating the per-player lateral view for every row. This module is the
 * single mapping from that row shape to the card contract.
 */

/** Select-string for a card-renderable players row. `innerNationality` makes
 *  the nationality join inner so `.in('nationality.name', …)` can filter. */
export function cachedPlayerColumns(innerNationality = false): string {
  return (
    'id, full_name, image_url, primary_position, date_of_birth, gbm_status, created_at, ' +
    'cached_market_value, cached_value_change_pct, cached_season_minutes, ' +
    'cached_league, cached_contract_expires, cached_opportunity, ' +
    `nationality:countries!players_nationality_country_id_fkey${innerNationality ? '!inner' : ''}(name), clubs(name)`
  );
}

interface CachedPlayerRow {
  id: string;
  full_name: string;
  image_url: string | null;
  primary_position: string | null;
  date_of_birth: string | null;
  gbm_status: string | null;
  cached_market_value: number | null;
  cached_value_change_pct: number | null;
  cached_season_minutes: number | null;
  cached_league: string | null;
  cached_contract_expires: string | null;
  cached_opportunity: number | null;
  nationality: { name: string } | { name: string }[] | null;
  clubs: { name: string } | { name: string }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function ageYears(dob: string | null): number | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 31_557_600_000;
}

function monthsFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / (30.44 * 24 * 3600 * 1000));
}

export function fromCachedPlayer(row: CachedPlayerRow): PlayerCardData {
  return {
    player_id: row.id,
    full_name: row.full_name,
    image_url: row.image_url,
    age: ageYears(row.date_of_birth),
    primary_position: row.primary_position,
    nationality: one(row.nationality)?.name ?? null,
    club_name: one(row.clubs)?.name ?? null,
    league_name: row.cached_league,
    market_value: row.cached_market_value,
    value_change_12m_pct: row.cached_value_change_pct,
    contract_months_remaining: monthsFromToday(row.cached_contract_expires),
    season_minutes: row.cached_season_minutes,
    gbm_status: row.gbm_status,
    gbm_opportunity: row.cached_opportunity,
  };
}

/** ISO date `years` back from now — for age-band filters on date_of_birth. */
export function dobCutoff(years: number): string {
  return new Date(Date.now() - years * 31_557_600_000).toISOString().slice(0, 10);
}

/** ISO date `months` ahead — for contract-window filters. */
export function monthsAhead(months: number): string {
  return new Date(Date.now() + months * 30.44 * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
