/**
 * WYSCOUT (Hudl) PROVIDER — API v3
 * ---------------------------------------------------------------------------
 * GBM's primary professional data provider.
 *
 * Auth:      HTTP Basic (API credentials, distinct from the website login)
 * Base URL:  https://apirest.wyscout.com/v3
 * Rate:      ~12 req/s documented; we default to 10 to stay clear of 429s.
 *
 * Notable endpoints this adapter uses:
 *   /players/{id}                  profile
 *   /players/{id}/career           club-by-club career with appearances
 *   /players/{id}/transfers        transfer history
 *   /players/{id}/contractinfo     contract expiry AND agencies  <- valuable
 *   /players/{id}/advancedstats    season advanced metrics
 *   /teams/{id}/squad              squad list
 *   /competitions, /competitions/{id}/seasons, /seasons/{id}/{players,teams}
 *   /search                        name search
 *
 * Parsing is deliberately tolerant. Wyscout account tiers expose different
 * fields, and a missing block must degrade to `undefined` rather than throw —
 * a scouting platform that crashes on an unusual player profile is useless.
 */

import { HttpClient } from '../http.js';
import {
  Foot,
  FootballDataProvider,
  NO_CAPABILITIES,
  ProviderCapabilities,
  ProviderCareerEntry,
  ProviderClub,
  ProviderCompetition,
  ProviderContract,
  ProviderError,
  ProviderHealth,
  ProviderNotConfiguredError,
  ProviderPlayer,
  ProviderPlayerSeasonStats,
  ProviderRepresentation,
  ProviderSeason,
  ProviderTransfer,
  PlayerSearchQuery,
  WithProvenance,
  nowIso,
} from '../types.js';

// ---------------------------------------------------------------------------
// Raw Wyscout response shapes (partial — only what we consume)
// ---------------------------------------------------------------------------

interface WyArea {
  id?: number;
  alpha2code?: string;
  alpha3code?: string;
  name?: string;
}

interface WyRole {
  code2?: string;
  code3?: string;
  name?: string;
}

interface WyPlayer {
  wyId: number;
  shortName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  birthArea?: WyArea;
  passportArea?: WyArea;
  height?: number;
  weight?: number;
  foot?: string;
  role?: WyRole;
  currentTeamId?: number | null;
  currentNationalTeamId?: number | null;
  imageDataURL?: string;
  gender?: string;
  status?: string;
}

interface WyTeam {
  wyId: number;
  name?: string;
  officialName?: string;
  area?: WyArea;
  city?: string;
  imageDataURL?: string;
  type?: string;
}

interface WyCompetition {
  wyId: number;
  name?: string;
  area?: WyArea;
  divisionLevel?: number;
  category?: string;
  gender?: string;
  format?: string;
  type?: string;
}

interface WySeason {
  wyId: number;
  name?: string;
  competitionId?: number;
  startDate?: string;
  endDate?: string;
  active?: boolean;
}

const CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  searchPlayers: true,
  getPlayer: true,
  getPlayerCareer: true,
  getPlayerSeasonStats: true,
  getPlayerMatchStats: true,
  getTeam: true,
  getSquad: true,
  getCompetitions: true,
  getSeasons: true,
  getMatches: true,
  getTransfers: true,
  getContractInformation: true,
  // CONFIRMED against the official v3 OpenAPI spec (2026-07-03):
  // PlayerContractinfo carries `agencies: string[]` alongside
  // `contractExpiration`, so Wyscout is a genuine second source for
  // representation alongside Transfermarkt.
  getRepresentationInformation: true,
  // The official v3 spec exposes NO /players/{wyId}/injuries endpoint.
  // Third-party clients advertise one, but it is not part of v3 — calling it
  // would 404. Injury data must come from another provider.
  getInjuries: false,
};

export interface WyscoutConfig {
  username?: string;
  password?: string;
  baseUrl?: string;
  apiVersion?: string;
  requestsPerSecond?: number;
}

export class WyscoutProvider implements FootballDataProvider {
  readonly code = 'WYSCOUT' as const;
  readonly name = 'Wyscout (Hudl)';
  readonly capabilities = CAPABILITIES;

  private readonly username?: string;
  private readonly password?: string;
  private readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(config: WyscoutConfig = {}) {
    this.username = config.username ?? process.env.WYSCOUT_USERNAME;
    this.password = config.password ?? process.env.WYSCOUT_PASSWORD;

    const root = (config.baseUrl ?? process.env.WYSCOUT_BASE_URL ?? 'https://apirest.wyscout.com')
      .replace(/\/+$/, '');
    const version = config.apiVersion ?? process.env.WYSCOUT_API_VERSION ?? 'v3';
    this.baseUrl = `${root}/${version}`;

    const rps = config.requestsPerSecond
      ?? Number(process.env.WYSCOUT_RATE_LIMIT_PER_SECOND ?? 10);

    this.http = new HttpClient({
      provider: 'WYSCOUT',
      baseUrl: this.baseUrl,
      requestsPerSecond: Number.isFinite(rps) && rps > 0 ? rps : 10,
      headers: this.isConfigured() ? { Authorization: this.authHeader() } : {},
      userAgent: process.env.GBM_USER_AGENT ?? 'GBM-Intelligence/0.1',
    });
  }

  isConfigured(): boolean {
    return Boolean(this.username && this.password);
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${token}`;
  }

  private assertConfigured(): void {
    if (this.isConfigured()) return;
    const missing: string[] = [];
    if (!this.username) missing.push('WYSCOUT_USERNAME');
    if (!this.password) missing.push('WYSCOUT_PASSWORD');
    throw new ProviderNotConfiguredError('WYSCOUT', missing);
  }

  private provenance(externalId: string, path: string, raw: unknown) {
    return {
      provider: this.code,
      externalId,
      sourceUrl: `${this.baseUrl}${path}`,
      retrievedAt: nowIso(),
      raw,
    };
  }

  // -------------------------------------------------------------------------
  // Health / permissions discovery
  // -------------------------------------------------------------------------

  /**
   * Probes the cheapest endpoint (/areas) to verify auth, then samples a few
   * representative endpoints to discover what this account is actually
   * entitled to. Wyscout contracts differ wildly between customers, so
   * discovering permissions empirically beats assuming them.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = nowIso();
    if (!this.isConfigured()) {
      return {
        provider: this.code,
        configured: false,
        reachable: false,
        authenticated: false,
        message: 'WYSCOUT_USERNAME / WYSCOUT_PASSWORD are not set.',
        checkedAt,
      };
    }

    const started = Date.now();
    try {
      await this.http.request<unknown>('/areas');
      const latencyMs = Date.now() - started;

      // Probe with VALID parameters. /competitions requires areaId and
      // /search requires query+objType — probing without them returns 400,
      // which would be misrecorded as "account lacks this scope".
      const probes: Array<[string, string, Record<string, string> | undefined]> = [
        ['competitions', '/competitions', { areaId: 'ENG' }],
        ['search', '/search', { query: 'silva', objType: 'player' }],
      ];
      const permissions: string[] = ['areas'];
      for (const [label, path, query] of probes) {
        try {
          await this.http.request<unknown>(path, { query, allowNotFound: true });
          permissions.push(label);
        } catch {
          // A 403 here is information, not a failure: it tells us the account
          // lacks that scope. Record it by omission and carry on.
        }
      }

      return {
        provider: this.code,
        configured: true,
        reachable: true,
        authenticated: true,
        message: `Authenticated. Endpoints available: ${permissions.join(', ')}.`,
        permissions,
        checkedAt,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAuth = /401|403/.test(message);
      return {
        provider: this.code,
        configured: true,
        reachable: !isAuth,
        authenticated: false,
        message: isAuth
          ? `Credentials rejected by Wyscout: ${message}`
          : `Could not reach Wyscout: ${message}`,
        checkedAt,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private static mapFoot(foot?: string): Foot {
    switch ((foot ?? '').toLowerCase()) {
      case 'left': return 'LEFT';
      case 'right': return 'RIGHT';
      case 'both':
      case 'both-footed': return 'BOTH';
      default: return 'UNKNOWN';
    }
  }

  private static fullName(p: WyPlayer): string {
    const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
    const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
    return joined || p.shortName || `Wyscout player ${p.wyId}`;
  }

  private static mapPlayer(p: WyPlayer): ProviderPlayer {
    return {
      externalId: String(p.wyId),
      fullName: WyscoutProvider.fullName(p),
      shortName: p.shortName,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.birthDate?.slice(0, 10),
      nationality: p.passportArea?.name ?? p.birthArea?.name,
      secondNationality:
        p.passportArea?.name && p.birthArea?.name && p.passportArea.name !== p.birthArea.name
          ? p.birthArea.name
          : undefined,
      heightCm: p.height && p.height > 0 ? p.height : undefined,
      weightKg: p.weight && p.weight > 0 ? p.weight : undefined,
      foot: WyscoutProvider.mapFoot(p.foot),
      primaryPosition: p.role?.code3 ?? p.role?.name,
      currentClubExternalId: p.currentTeamId ? String(p.currentTeamId) : undefined,
      imageUrl: p.imageDataURL || undefined,
      isGoalkeeper: (p.role?.code3 ?? '').toUpperCase() === 'GKP'
        || (p.role?.code2 ?? '').toUpperCase() === 'GK',
      isRetired: (p.status ?? '').toLowerCase() === 'retired',
    };
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  async getPlayer(externalId: string): Promise<WithProvenance<ProviderPlayer> | null> {
    this.assertConfigured();
    const path = `/players/${externalId}`;
    const data = await this.http.request<WyPlayer>(path, { allowNotFound: true });
    if (!data?.wyId) return null;
    return {
      ...WyscoutProvider.mapPlayer(data),
      provenance: this.provenance(String(data.wyId), path, data),
    };
  }

  /**
   * /search returns a BARE ARRAY of mixed entities
   * (oneOf Competition | Team | Player | Referee), NOT an envelope object.
   * An earlier implementation read `data.players` and therefore always
   * returned zero results. Filter to Player-shaped members defensively:
   * objType=player should already constrain the response, but the schema
   * permits mixed types and a stray Team would otherwise map to a garbage
   * player record.
   */
  async searchPlayers(query: PlayerSearchQuery): Promise<WithProvenance<ProviderPlayer>[]> {
    this.assertConfigured();
    const path = '/search';
    const data = await this.http.request<unknown[]>(path, {
      query: { query: query.name, objType: 'player' },
      allowNotFound: true,
    });

    const rows = Array.isArray(data) ? data : [];
    return rows
      .filter((r): r is WyPlayer => {
        const o = r as Record<string, unknown>;
        // Players carry firstName/lastName/birthDate; Teams and Competitions
        // carry `name` but none of these.
        return Boolean(o && typeof o === 'object' && o.wyId
          && ('firstName' in o || 'lastName' in o || 'birthDate' in o));
      })
      .slice(0, query.limit ?? 25)
      .map((p) => ({
        ...WyscoutProvider.mapPlayer(p),
        provenance: this.provenance(String(p.wyId), path, p),
      }));
  }

  async getPlayerCareer(externalId: string): Promise<WithProvenance<ProviderCareerEntry>[]> {
    this.assertConfigured();
    const path = `/players/${externalId}/career`;
    const data = await this.http.request<{ career?: Record<string, unknown>[] }>(path, {
      allowNotFound: true,
    });
    const entries = data?.career ?? [];
    return entries.map((e) => ({
      playerExternalId: externalId,
      clubExternalId: e.teamId != null ? String(e.teamId) : undefined,
      clubName: typeof e.teamName === 'string' ? e.teamName : undefined,
      competitionExternalId: e.competitionId != null ? String(e.competitionId) : undefined,
      competitionName: typeof e.competitionName === 'string' ? e.competitionName : undefined,
      seasonExternalId: e.seasonId != null ? String(e.seasonId) : undefined,
      seasonName: typeof e.seasonName === 'string' ? e.seasonName : undefined,
      appearances: numeric(e.appearances),
      goals: numeric(e.goal ?? e.goals),
      minutesPlayed: numeric(e.minutesPlayed),
      provenance: this.provenance(externalId, path, e),
    }));
  }

  /**
   * Season advanced statistics.
   *
   * `compId` is REQUIRED by the v3 spec — omitting it returns 400, not a
   * league-wide aggregate. Callers must therefore iterate the player's
   * competitions (from getPlayerCareer) and request stats per competition.
   */
  async getPlayerSeasonStats(
    externalId: string,
    opts: { competitionExternalId?: string; seasonExternalId?: string } = {},
  ): Promise<WithProvenance<ProviderPlayerSeasonStats>[]> {
    this.assertConfigured();
    if (!opts.competitionExternalId) {
      throw new ProviderError(
        'WYSCOUT',
        'getPlayerSeasonStats requires competitionExternalId: /players/{id}/advancedstats '
        + 'declares compId as a required parameter in the v3 spec.',
      );
    }
    const path = `/players/${externalId}/advancedstats`;
    const data = await this.http.request<Record<string, unknown>>(path, {
      query: {
        compId: opts.competitionExternalId,
        seasonId: opts.seasonExternalId,
      },
      allowNotFound: true,
    });
    if (!data) return [];

    // The spec defines a single PlayerAdvancedStats object per (competition,
    // season). Kept array-tolerant in case an account returns a collection.
    const blocks: Record<string, unknown>[] = Array.isArray(data.competitions)
      ? (data.competitions as Record<string, unknown>[])
      : [data];

    return blocks.map((block) => {
      const total = (block.total ?? {}) as Record<string, unknown>;
      const percent = (block.percent ?? {}) as Record<string, unknown>;
      return {
        playerExternalId: externalId,
        seasonExternalId: block.seasonId != null ? String(block.seasonId) : opts.seasonExternalId,
        competitionExternalId:
          block.competitionId != null ? String(block.competitionId) : opts.competitionExternalId,
        clubExternalId: block.teamId != null ? String(block.teamId) : undefined,
        matchesPlayed: numeric(total.matches ?? block.matches),
        matchesStarted: numeric(total.matchesInStart ?? block.matchesInStart),
        minutesPlayed: numeric(total.minutesOnField ?? block.minutesOnField),
        goals: numeric(total.goals),
        assists: numeric(total.assists),
        yellowCards: numeric(total.yellowCards),
        redCards: numeric(total.redCards),
        xg: numeric(total.xgShot ?? total.xg),
        xa: numeric(total.xgAssist ?? total.xa),
        shots: numeric(total.shots),
        shotsOnTarget: numeric(total.shotsOnTarget),
        keyPasses: numeric(total.keyPasses),
        passes: numeric(total.passes),
        passesAccurate: numeric(total.successfulPasses),
        dribbles: numeric(total.dribbles),
        dribblesSuccessful: numeric(total.successfulDribbles),
        duels: numeric(total.duels),
        duelsWon: numeric(total.duelsWon),
        aerialDuels: numeric(total.aerialDuels),
        aerialDuelsWon: numeric(total.aerialDuelsWon),
        interceptions: numeric(total.interceptions),
        tackles: numeric(total.slidingTackles ?? total.tackles),
        clearances: numeric(total.clearances),
        progressivePasses: numeric(total.progressivePasses),
        progressiveCarries: numeric(total.progressiveRun ?? total.progressiveCarries),
        touchesInBox: numeric(total.touchInBox),
        // Goalkeeping metrics are gk-prefixed in PlayerAdvancedStatsTotal.
        // The unprefixed names (saves / concededGoals / cleanSheets) do not
        // exist in the schema and silently produced null for every keeper.
        saves: numeric(total.gkSaves),
        goalsConceded: numeric(total.gkConcededGoals),
        cleanSheets: numeric(total.gkCleanSheets),
        // Everything Wyscout sends is preserved so no metric is lost simply
        // because this adapter did not anticipate it.
        advanced: { total, percent, ...stripKnown(block) },
        provenance: this.provenance(externalId, path, block),
      };
    });
  }

  async getPlayerMatchStats(externalId: string): Promise<WithProvenance<unknown>[]> {
    this.assertConfigured();
    const path = `/players/${externalId}/matches`;
    const data = await this.http.request<{ matches?: unknown[] }>(path, { allowNotFound: true });
    return (data?.matches ?? []).map((m) => ({
      ...(m as object),
      provenance: this.provenance(externalId, path, m),
    })) as WithProvenance<unknown>[];
  }

  async getTransfers(playerExternalId: string): Promise<WithProvenance<ProviderTransfer>[]> {
    this.assertConfigured();
    const path = `/players/${playerExternalId}/transfers`;
    const data = await this.http.request<{ transfer?: Record<string, unknown>[] }>(path, {
      allowNotFound: true,
    });
    const rows = data?.transfer ?? [];
    return rows.map((t) => ({
      playerExternalId,
      fromClubExternalId: t.fromTeamId != null ? String(t.fromTeamId) : undefined,
      toClubExternalId: t.toTeamId != null ? String(t.toTeamId) : undefined,
      fromClubName: typeof t.fromTeamName === 'string' ? t.fromTeamName : undefined,
      toClubName: typeof t.toTeamName === 'string' ? t.toTeamName : undefined,
      transferDate: typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : undefined,
      transferType: typeof t.type === 'string' ? t.type.toUpperCase() : undefined,
      feeAmount: numeric(t.value),
      // Transfer.currency is an enum of USD | EUR | GBP. Assuming EUR would
      // silently misstate fees on English and US transfers.
      feeCurrency: typeof t.currency === 'string' ? t.currency : 'EUR',
      isLoan: /loan/i.test(String(t.type ?? '')),
      isFree: numeric(t.value) === 0,
      provenance: this.provenance(playerExternalId, path, t),
    }));
  }

  /**
   * /players/{id}/contractinfo returns contract expiry and, on most accounts,
   * an `agencies` array. We surface it in two shapes: as a contract here, and
   * as representation via getRepresentationInformation.
   */
  async getContractInformation(
    playerExternalId: string,
  ): Promise<WithProvenance<ProviderContract> | null> {
    this.assertConfigured();
    const path = `/players/${playerExternalId}/contractinfo`;
    const data = await this.http.request<Record<string, unknown>>(path, { allowNotFound: true });
    if (!data) return null;

    const expires = typeof data.contractExpiration === 'string'
      ? data.contractExpiration.slice(0, 10)
      : undefined;

    return {
      playerExternalId,
      expiresOn: expires,
      status: expires && new Date(expires) < new Date() ? 'EXPIRED' : 'ACTIVE',
      provenance: this.provenance(playerExternalId, path, data),
    };
  }

  async getRepresentationInformation(
    playerExternalId: string,
  ): Promise<WithProvenance<ProviderRepresentation> | null> {
    this.assertConfigured();
    const path = `/players/${playerExternalId}/contractinfo`;
    const data = await this.http.request<Record<string, unknown>>(path, { allowNotFound: true });
    if (!data) return null;

    const agencies = Array.isArray(data.agencies)
      ? (data.agencies as unknown[]).map(String).filter(Boolean)
      : [];

    // A response with no `agencies` key at all is genuinely UNKNOWN — this
    // account may simply not be entitled to agency data. Only an explicit
    // empty array is evidence that nothing was listed.
    const hasAgencyField = Object.prototype.hasOwnProperty.call(data, 'agencies');

    return {
      playerExternalId,
      agencyName: agencies[0],
      status: agencies.length > 0
        ? 'KNOWN_AGENCY'
        : hasAgencyField
          ? 'NO_AGENCY_LISTED'
          : 'UNKNOWN',
      provenance: this.provenance(playerExternalId, path, data),
    };
  }

  // NOTE: no getInjuries() here on purpose.
  // The official v3 spec (docs/wyscout-openapi-v3.yml) defines a
  // `PlayerInjuries` *schema* but exposes no path that returns it — there is
  // no /players/{wyId}/injuries operation among the 48 documented paths.
  // Several third-party clients advertise one; calling it 404s. Injury data
  // has to come from another provider, so the capability is declared false
  // rather than implemented against an endpoint that does not exist.

  // -------------------------------------------------------------------------
  // Teams / competitions / seasons
  // -------------------------------------------------------------------------

  async getTeam(externalId: string): Promise<WithProvenance<ProviderClub> | null> {
    this.assertConfigured();
    const path = `/teams/${externalId}`;
    const t = await this.http.request<WyTeam>(path, { allowNotFound: true });
    if (!t?.wyId) return null;
    return {
      externalId: String(t.wyId),
      name: t.name ?? t.officialName ?? `Wyscout team ${t.wyId}`,
      officialName: t.officialName,
      country: t.area?.name,
      city: t.city,
      crestUrl: t.imageDataURL || undefined,
      isNationalTeam: (t.type ?? '').toLowerCase() === 'national',
      provenance: this.provenance(String(t.wyId), path, t),
    };
  }

  async getSquad(
    externalId: string,
    opts: { seasonExternalId?: string } = {},
  ): Promise<WithProvenance<ProviderPlayer>[]> {
    this.assertConfigured();
    const path = `/teams/${externalId}/squad`;
    const data = await this.http.request<{ squad?: WyPlayer[]; players?: WyPlayer[] }>(path, {
      query: { seasonId: opts.seasonExternalId },
      allowNotFound: true,
    });
    const players = data?.squad ?? data?.players ?? [];
    return players.map((p) => ({
      ...WyscoutProvider.mapPlayer(p),
      currentClubExternalId: externalId,
      provenance: this.provenance(String(p.wyId), path, p),
    }));
  }

  /**
   * `areaId` is REQUIRED by the v3 spec — there is no "all competitions"
   * call. To enumerate everything, walk /areas first and request per area.
   * areaId is the three-letter area code (e.g. 'ENG', 'ESP'), matching
   * Area.alpha3code from /areas.
   */
  async getCompetitions(
    opts: { areaCode?: string } = {},
  ): Promise<WithProvenance<ProviderCompetition>[]> {
    this.assertConfigured();
    if (!opts.areaCode) {
      throw new ProviderError(
        'WYSCOUT',
        'getCompetitions requires areaCode: /competitions declares areaId as a required '
        + 'parameter in the v3 spec. Enumerate areas via getAreas() and call per area.',
      );
    }
    const path = '/competitions';
    const data = await this.http.request<{ competitions?: WyCompetition[] }>(path, {
      query: { areaId: opts.areaCode },
      allowNotFound: true,
    });
    return (data?.competitions ?? []).map((c) => ({
      externalId: String(c.wyId),
      name: c.name ?? `Wyscout competition ${c.wyId}`,
      country: c.area?.name,
      areaName: c.area?.name,
      tier: mapDivisionLevel(c.divisionLevel, c.type),
      gender: (c.gender ?? 'male').toUpperCase(),
      isYouth: (c.category ?? '').toLowerCase().includes('youth'),
      provenance: this.provenance(String(c.wyId), path, c),
    }));
  }

  async getSeasons(competitionExternalId: string): Promise<WithProvenance<ProviderSeason>[]> {
    this.assertConfigured();
    const path = `/competitions/${competitionExternalId}/seasons`;
    const data = await this.http.request<{ seasons?: Array<{ season?: WySeason } & WySeason> }>(
      path,
      { allowNotFound: true },
    );
    const rows = data?.seasons ?? [];
    return rows.map((row) => {
      // Wyscout wraps each season under a `season` key in some responses.
      const s = (row.season ?? row) as WySeason;
      return {
        externalId: String(s.wyId),
        competitionExternalId,
        name: s.name ?? String(s.wyId),
        startDate: s.startDate?.slice(0, 10),
        endDate: s.endDate?.slice(0, 10),
        isCurrent: Boolean(s.active),
        provenance: this.provenance(String(s.wyId), path, row),
      };
    });
  }

  /**
   * Season squad list — PAGINATED.
   *
   * /seasons/{id}/players caps at 100 results per page and returns a `meta`
   * envelope ({page_current, page_count, page_size, total_items}). Reading
   * only the first page silently truncated every league import to 100
   * players while appearing to succeed, which is the worst possible failure
   * mode for a scouting database. This walks all pages.
   */
  async getSeasonPlayers(
    seasonExternalId: string,
    opts: { maxPages?: number } = {},
  ): Promise<WithProvenance<ProviderPlayer>[]> {
    this.assertConfigured();
    const path = `/seasons/${seasonExternalId}/players`;
    return this.paginatePlayers(path, opts.maxPages);
  }

  async getCompetitionPlayers(
    competitionExternalId: string,
    opts: { maxPages?: number } = {},
  ): Promise<WithProvenance<ProviderPlayer>[]> {
    this.assertConfigured();
    const path = `/competitions/${competitionExternalId}/players`;
    return this.paginatePlayers(path, opts.maxPages);
  }

  /** Walks a paginated player endpoint until meta.page_count is exhausted. */
  private async paginatePlayers(
    path: string,
    maxPages = 100,
  ): Promise<WithProvenance<ProviderPlayer>[]> {
    const out: WithProvenance<ProviderPlayer>[] = [];
    let page = 1;
    let pageCount = 1;

    do {
      const data = await this.http.request<{
        players?: WyPlayer[];
        meta?: { page_current?: number; page_count?: number; page_size?: number; total_items?: number };
      }>(path, {
        query: { page, limit: 100 },
        allowNotFound: true,
      });
      if (!data) break;

      for (const p of data.players ?? []) {
        out.push({
          ...WyscoutProvider.mapPlayer(p),
          provenance: this.provenance(String(p.wyId), path, p),
        });
      }

      pageCount = Number(data.meta?.page_count ?? 1);
      // Defend against a missing/!nonsensical meta block rather than looping
      // forever on an account that does not return one.
      if (!Number.isFinite(pageCount) || pageCount < 1) break;
      if ((data.players ?? []).length === 0) break;
      page += 1;
    } while (page <= Math.min(pageCount, maxPages));

    return out;
  }

  async getSeasonTeams(seasonExternalId: string): Promise<WithProvenance<ProviderClub>[]> {
    this.assertConfigured();
    const path = `/seasons/${seasonExternalId}/teams`;
    const data = await this.http.request<{ teams?: WyTeam[] }>(path, { allowNotFound: true });
    return (data?.teams ?? []).map((t) => ({
      externalId: String(t.wyId),
      name: t.name ?? t.officialName ?? `Wyscout team ${t.wyId}`,
      officialName: t.officialName,
      country: t.area?.name,
      city: t.city,
      crestUrl: t.imageDataURL || undefined,
      provenance: this.provenance(String(t.wyId), path, t),
    }));
  }

  /** Raw /areas passthrough — the cheapest authenticated call, used in tests. */
  async getAreas(): Promise<unknown> {
    this.assertConfigured();
    return this.http.request<unknown>('/areas');
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Drop keys already mapped to first-class columns so `advanced` stays lean. */
function stripKnown(block: Record<string, unknown>): Record<string, unknown> {
  const { total, percent, seasonId, competitionId, teamId, ...rest } = block;
  void total; void percent; void seasonId; void competitionId; void teamId;
  return rest;
}

function mapDivisionLevel(level?: number, type?: string): string {
  if ((type ?? '').toLowerCase() === 'international') return 'INTERNATIONAL';
  switch (level) {
    case 1: return 'FIRST_TIER';
    case 2: return 'SECOND_TIER';
    case 3: return 'THIRD_TIER';
    case 4: return 'FOURTH_TIER';
    default: return level && level > 4 ? 'LOWER_TIER' : 'UNKNOWN';
  }
}
