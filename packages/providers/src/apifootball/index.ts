/**
 * API-FOOTBALL PROVIDER (api-sports.io)
 * ---------------------------------------------------------------------------
 * Season and match statistics, squads, injuries and youth competitions.
 *
 * GBM's role for this provider is deliberately narrow. It is NOT an advanced-
 * metrics source — it carries no xG, no progressive actions and nothing
 * positional, and its transfer records have a free-text `type` with no fee or
 * currency, so Transfermarkt's structured transfers remain authoritative.
 * What it uniquely provides is per-season and per-match participation across
 * 1,239 competitions including youth and reserve leagues, plus injury and
 * suspension histories with real dates.
 *
 * Errors arrive with HTTP 200. The API reports plan and parameter failures in
 * a populated `errors` field on an otherwise successful response, so every
 * call must inspect the envelope rather than trusting the status code — see
 * `unwrap()`.
 *
 * Verified 2026-08-19 against a live key:
 *   - Free plans are restricted to seasons 2022-2024. Requesting 2025 returns
 *     `{"plan":"Free plans do not have access to this season, try from 2022 to
 *     2024."}` with zero results. Current-season data requires a paid tier.
 *   - All competitions and endpoints are available on every tier; only
 *     throughput is metered.
 */

import { HttpClient } from '../http.js';
import {
  FootballDataProvider,
  NO_CAPABILITIES,
  ProviderCapabilities,
  ProviderCode,
  ProviderClub,
  ProviderCompetition,
  ProviderHealth,
  ProviderInjury,
  ProviderPlayer,
  ProviderPlayerSeasonStats,
  ProviderSeason,
  Provenance,
  WithProvenance,
  nowIso,
} from '../types.js';

const CODE: ProviderCode = 'API_FOOTBALL';
const BASE_URL = 'https://v3.football.api-sports.io';

const CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  searchPlayers: true,
  getPlayer: true,
  getPlayerSeasonStats: true,
  getSquad: true,
  getTeam: true,
  getCompetitions: true,
  getSeasons: true,
  getInjuries: true,
  // Deliberately false. The endpoints exist but the data does not support GBM's
  // use: transfers carry no fee or currency, and there is no market value,
  // contract or agent field anywhere in the API.
  getTransfers: false,
  getMarketValues: false,
  getContractInformation: false,
  getRepresentationInformation: false,
};

export interface ApiFootballConfig {
  apiKey?: string;
  baseUrl?: string;
  requestsPerSecond?: number;
}

/** The envelope every endpoint returns. */
interface Envelope<T> {
  errors?: unknown;
  results?: number;
  paging?: { current: number; total: number };
  response?: T;
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly code = CODE;
  readonly name = 'API-Football';
  readonly capabilities = CAPABILITIES;

  private readonly apiKey?: string;
  private readonly http: HttpClient;

  constructor(config: ApiFootballConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.API_FOOTBALL_KEY;
    const rps = config.requestsPerSecond ?? Number(process.env.API_FOOTBALL_RATE_LIMIT_PER_SECOND);

    this.http = new HttpClient({
      provider: CODE,
      baseUrl: config.baseUrl ?? process.env.API_FOOTBALL_BASE_URL ?? BASE_URL,
      // A per-minute limit exists but its per-plan value is undocumented, so
      // this stays conservative rather than guessing.
      requestsPerSecond: Number.isFinite(rps) && rps > 0 ? rps : 2,
      headers: this.apiKey ? { 'x-apisports-key': this.apiKey } : {},
      userAgent: process.env.GBM_USER_AGENT ?? 'GBM-Intelligence/0.1',
    });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * `/status` reports plan and quota and does not count against the daily
   * allowance, which makes it the correct probe.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = nowIso();
    if (!this.isConfigured()) {
      return {
        provider: CODE,
        configured: false,
        reachable: false,
        authenticated: false,
        message: 'API_FOOTBALL_KEY is not set.',
        checkedAt,
      };
    }

    const started = Date.now();
    try {
      const body = await this.http.request<Envelope<StatusResponse>>('/status');
      const account = body?.response;
      if (!account) {
        return {
          provider: CODE,
          configured: true,
          reachable: true,
          authenticated: false,
          message: 'Status endpoint returned no account — key is likely invalid.',
          checkedAt,
          latencyMs: Date.now() - started,
        };
      }
      const { plan, active } = account.subscription;
      const { current, limit_day } = account.requests;
      return {
        provider: CODE,
        configured: true,
        reachable: true,
        authenticated: active,
        message: `plan=${plan} quota=${current}/${limit_day} per day`,
        // Free plans are season-restricted; record that as an observed limit
        // rather than leaving callers to discover it as an empty result set.
        permissions: plan.toLowerCase() === 'free' ? ['seasons:2022-2024'] : ['seasons:all'],
        checkedAt,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        provider: CODE,
        configured: true,
        reachable: false,
        authenticated: false,
        message: err instanceof Error ? err.message : String(err),
        checkedAt,
        latencyMs: Date.now() - started,
      };
    }
  }

  /** Plan and quota, for the data page and for pre-flighting a large import. */
  async status(): Promise<StatusResponse | null> {
    const body = await this.http.request<Envelope<StatusResponse>>('/status');
    return body?.response ?? null;
  }

  async searchPlayers(query: {
    name?: string;
    competitionExternalId?: string;
    seasonExternalId?: string;
  }): Promise<WithProvenance<ProviderPlayer>[]> {
    // The search endpoint requires a league or team alongside the name.
    if (!query.name || !query.competitionExternalId) return [];
    const rows = await this.collect<PlayerRecord>('/players', {
      search: query.name,
      league: query.competitionExternalId,
      season: query.seasonExternalId ?? String(new Date().getFullYear()),
    });
    return rows.map((r) => this.toPlayer(r));
  }

  async getPlayer(externalId: string): Promise<WithProvenance<ProviderPlayer> | null> {
    const rows = await this.collect<PlayerRecord>('/players', { id: externalId, season: currentSeason() });
    return rows.length ? this.toPlayer(rows[0]) : null;
  }

  async getPlayerSeasonStats(
    externalId: string,
    opts: { competitionExternalId?: string; seasonExternalId?: string } = {},
  ): Promise<WithProvenance<ProviderPlayerSeasonStats>[]> {
    const rows = await this.collect<PlayerRecord>('/players', {
      id: externalId,
      season: opts.seasonExternalId ?? currentSeason(),
      ...(opts.competitionExternalId ? { league: opts.competitionExternalId } : {}),
    });

    const out: WithProvenance<ProviderPlayerSeasonStats>[] = [];
    for (const row of rows) {
      for (const s of row.statistics ?? []) {
        out.push({
          ...this.toSeasonStats(row, s, opts.seasonExternalId),
          provenance: this.provenance(String(row.player.id), row),
        });
      }
    }
    return out;
  }

  async getSquad(
    teamExternalId: string,
    opts: { seasonExternalId?: string } = {},
  ): Promise<WithProvenance<ProviderPlayer>[]> {
    const rows = await this.collect<PlayerRecord>('/players', {
      team: teamExternalId,
      season: opts.seasonExternalId ?? currentSeason(),
    });
    return rows.map((r) => this.toPlayer(r));
  }

  async getTeam(externalId: string): Promise<WithProvenance<ProviderClub> | null> {
    const rows = await this.collect<TeamRecord>('/teams', { id: externalId });
    if (!rows.length) return null;
    const t = rows[0];
    return {
      externalId: String(t.team.id),
      name: t.team.name,
      shortName: t.team.code ?? undefined,
      country: t.team.country ?? undefined,
      foundedYear: t.team.founded ?? undefined,
      crestUrl: t.team.logo ?? undefined,
      isNationalTeam: Boolean(t.team.national),
      provenance: this.provenance(String(t.team.id), t),
    };
  }

  async getCompetitions(): Promise<WithProvenance<ProviderCompetition>[]> {
    const rows = await this.collect<LeagueRecord>('/leagues', {});
    return rows.map((l) => ({
      externalId: String(l.league.id),
      name: l.league.name,
      areaName: l.country?.name ?? undefined,
      // 'League' | 'Cup'. Tier is not exposed, so GBM assigns it rather than
      // inventing one here.
      tier: undefined,
      isYouth: /\bU-?\d{2}\b|youth|junior|primavera/i.test(l.league.name),
      provenance: this.provenance(String(l.league.id), l),
    }));
  }

  async getSeasons(competitionExternalId: string): Promise<WithProvenance<ProviderSeason>[]> {
    const rows = await this.collect<LeagueRecord>('/leagues', { id: competitionExternalId });
    const out: WithProvenance<ProviderSeason>[] = [];
    for (const l of rows) {
      for (const s of l.seasons ?? []) {
        out.push({
          externalId: String(s.year),
          name: String(s.year),
          competitionExternalId: String(l.league.id),
          startDate: s.start ?? undefined,
          endDate: s.end ?? undefined,
          isCurrent: Boolean(s.current),
          provenance: this.provenance(`${l.league.id}:${s.year}`, s),
        });
      }
    }
    return out;
  }

  /**
   * Injuries and suspensions with real dates — genuinely additive, since
   * nothing else GBM holds carries them.
   *
   * NOTE: injury data is health data. Under Article 9 it must never be
   * collected for players under 18 — see docs/YOUTH_AND_MINORS.md. That gate
   * belongs in the ingestion layer, not here.
   */
  async getInjuries(playerExternalId: string): Promise<WithProvenance<ProviderInjury>[]> {
    const rows = await this.collect<InjuryRecord>('/injuries', {
      player: playerExternalId,
      season: currentSeason(),
    });
    return rows.map((r) => ({
      playerExternalId,
      injuryType: r.player?.type ?? undefined,
      description: r.player?.reason ?? undefined,
      startedOn: r.fixture?.date ? r.fixture.date.slice(0, 10) : undefined,
      provenance: this.provenance(playerExternalId, r),
    }));
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Unwraps the envelope, turning a populated `errors` field into a thrown
   * error. The API returns HTTP 200 for plan violations and bad parameters, so
   * without this a season the plan cannot reach would look like a player with
   * no matches — silently wrong rather than loudly broken.
   */
  private unwrap<T>(body: Envelope<T> | null, path: string): T | null {
    if (!body) return null;
    const errors = body.errors;
    const hasErrors = Array.isArray(errors)
      ? errors.length > 0
      : errors && typeof errors === 'object' && Object.keys(errors).length > 0;
    if (hasErrors) {
      throw new Error(`API-Football ${path}: ${JSON.stringify(errors)}`);
    }
    return body.response ?? null;
  }

  /** Follows pagination, which the players endpoint uses at 20 per page. */
  private async collect<T>(path: string, params: Record<string, string>): Promise<T[]> {
    if (!this.isConfigured()) {
      throw new Error('API_FOOTBALL_KEY is not set — cannot call API-Football.');
    }
    const out: T[] = [];
    let page = 1;
    for (;;) {
      const query = new URLSearchParams({ ...params, page: String(page) }).toString();
      const body = await this.http.request<Envelope<T[]>>(`${path}?${query}`);
      const rows = this.unwrap(body, path);
      if (!rows?.length) break;
      out.push(...rows);
      const total = body?.paging?.total ?? 1;
      if (page >= total || page >= 50) break; // hard stop; nothing legitimate needs 1000 pages
      page += 1;
    }
    return out;
  }

  private provenance(externalId: string, raw: unknown): Provenance {
    return { provider: CODE, externalId, retrievedAt: nowIso(), raw };
  }

  private toPlayer(row: PlayerRecord): WithProvenance<ProviderPlayer> {
    const p = row.player;
    const firstStat = row.statistics?.[0];
    return {
      externalId: String(p.id),
      fullName: p.name,
      firstName: p.firstname ?? undefined,
      lastName: p.lastname ?? undefined,
      dateOfBirth: p.birth?.date ?? undefined,
      birthPlace: p.birth?.place ?? undefined,
      nationality: p.nationality ?? undefined,
      heightCm: parseCm(p.height),
      weightKg: parseKg(p.weight),
      primaryPosition: firstStat?.games?.position ?? undefined,
      isGoalkeeper: firstStat?.games?.position === 'Goalkeeper',
      currentClubName: firstStat?.team?.name ?? undefined,
      currentClubExternalId: firstStat?.team?.id ? String(firstStat.team.id) : undefined,
      imageUrl: p.photo ?? undefined,
      provenance: this.provenance(String(p.id), row),
    };
  }

  private toSeasonStats(
    row: PlayerRecord,
    s: StatisticsRecord,
    seasonExternalId?: string,
  ): ProviderPlayerSeasonStats {
    return {
      playerExternalId: String(row.player.id),
      seasonExternalId: seasonExternalId ?? (s.league?.season ? String(s.league.season) : undefined),
      competitionExternalId: s.league?.id ? String(s.league.id) : undefined,
      clubExternalId: s.team?.id ? String(s.team.id) : undefined,
      matchesPlayed: s.games?.appearences ?? undefined,
      matchesStarted: s.games?.lineups ?? undefined,
      minutesPlayed: s.games?.minutes ?? undefined,
      goals: s.goals?.total ?? undefined,
      assists: s.goals?.assists ?? undefined,
      yellowCards: s.cards?.yellow ?? undefined,
      redCards: s.cards?.red ?? undefined,
      shots: s.shots?.total ?? undefined,
      shotsOnTarget: s.shots?.on ?? undefined,
      keyPasses: s.passes?.key ?? undefined,
      passes: s.passes?.total ?? undefined,
      passesAccurate: s.passes?.accuracy ?? undefined,
      dribbles: s.dribbles?.attempts ?? undefined,
      dribblesSuccessful: s.dribbles?.success ?? undefined,
      duels: s.duels?.total ?? undefined,
      duelsWon: s.duels?.won ?? undefined,
      tackles: s.tackles?.total ?? undefined,
      interceptions: s.tackles?.interceptions ?? undefined,
      saves: s.goals?.saves ?? undefined,
      goalsConceded: s.goals?.conceded ?? undefined,
      // The provider's own composite rating. Kept in `advanced` rather than
      // promoted to a first-class field: it is not comparable with any other
      // provider's rating, and blending incompatible measurements into one
      // percentile is exactly the definition-drift trap.
      advanced: {
        rating: s.games?.rating ? Number(s.games.rating) : undefined,
        captain: s.games?.captain ?? undefined,
        position: s.games?.position ?? undefined,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers and response shapes
// ---------------------------------------------------------------------------

/** Football seasons are labelled by starting year; the API expects that year. */
function currentSeason(): string {
  const now = new Date();
  return String(now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
}

function parseCm(v?: string | null): number | undefined {
  const n = Number.parseInt((v ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n >= 120 && n <= 230 ? n : undefined;
}

function parseKg(v?: string | null): number | undefined {
  const n = Number.parseInt((v ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n >= 30 && n <= 160 ? n : undefined;
}

export interface StatusResponse {
  account: { firstname?: string; lastname?: string; email?: string };
  subscription: { plan: string; end: string; active: boolean };
  requests: { current: number; limit_day: number };
}

interface PlayerRecord {
  player: {
    id: number;
    name: string;
    firstname?: string | null;
    lastname?: string | null;
    birth?: { date?: string | null; place?: string | null; country?: string | null };
    nationality?: string | null;
    height?: string | null;
    weight?: string | null;
    photo?: string | null;
  };
  statistics?: StatisticsRecord[];
}

interface StatisticsRecord {
  team?: { id?: number; name?: string };
  league?: { id?: number; name?: string; season?: number };
  games?: {
    appearences?: number | null;
    lineups?: number | null;
    minutes?: number | null;
    position?: string | null;
    rating?: string | null;
    captain?: boolean | null;
  };
  goals?: { total?: number | null; assists?: number | null; conceded?: number | null; saves?: number | null };
  cards?: { yellow?: number | null; red?: number | null };
  shots?: { total?: number | null; on?: number | null };
  passes?: { total?: number | null; key?: number | null; accuracy?: number | null };
  dribbles?: { attempts?: number | null; success?: number | null };
  duels?: { total?: number | null; won?: number | null };
  tackles?: { total?: number | null; interceptions?: number | null };
}

interface TeamRecord {
  team: {
    id: number;
    name: string;
    code?: string | null;
    country?: string | null;
    founded?: number | null;
    logo?: string | null;
    national?: boolean | null;
  };
}

interface LeagueRecord {
  league: { id: number; name: string; type?: string };
  country?: { name?: string; code?: string | null };
  seasons?: { year: number; start?: string; end?: string; current?: boolean }[];
}

interface InjuryRecord {
  player?: { id?: number; type?: string | null; reason?: string | null };
  fixture?: { date?: string | null };
}
