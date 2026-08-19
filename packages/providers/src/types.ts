/**
 * GBM INTELLIGENCE — PROVIDER CONTRACT
 * ---------------------------------------------------------------------------
 * Every external football data source is adapted to this shape. The rest of
 * the platform never imports a provider SDK directly — it talks to this
 * interface, which is what lets GBM swap, add or drop sources without
 * rewriting the ingestion or application layers.
 *
 * Design rules:
 *   1. A provider implements ONLY what it genuinely supports. Capability is
 *      declared explicitly rather than discovered by calling and failing.
 *   2. Every returned record carries its provenance (`provider`, `sourceUrl`,
 *      `retrievedAt`) so a fact can always be traced back to its origin.
 *   3. Providers return provider-shaped IDs as strings. Mapping those onto
 *      GBM UUIDs is the entity-resolution layer's job, never the provider's.
 */

// ---------------------------------------------------------------------------
// Provider identity
// ---------------------------------------------------------------------------

export type ProviderCode =
  | 'WYSCOUT'
  | 'TRANSFERMARKT'
  | 'TRANSFERMARKT_DATASET'
  | 'REEP'
  | 'BESOCCER'
  | 'SOFASCORE'
  | 'FOTMOB'
  | 'SPORTDB'
  | 'FBREF'
  | 'UNDERSTAT'
  | 'STATSBOMB'
  | 'SPORTMONKS'
  | 'API_FOOTBALL'
  | 'IMPECT'
  | 'WIKIDATA'
  | 'FEDERATION'
  | 'CLUB'
  | 'GBM_INTERNAL';

/**
 * What a provider can actually do. Declared up front so the orchestrator can
 * plan an enrichment run without trial-and-error calls.
 */
export interface ProviderCapabilities {
  searchPlayers: boolean;
  getPlayer: boolean;
  getPlayerCareer: boolean;
  getPlayerSeasonStats: boolean;
  getPlayerMatchStats: boolean;
  getTeams: boolean;
  getTeam: boolean;
  getSquad: boolean;
  getCompetitions: boolean;
  getSeasons: boolean;
  getMatches: boolean;
  getTransfers: boolean;
  getMarketValues: boolean;
  getContractInformation: boolean;
  getRepresentationInformation: boolean;
  getInjuries: boolean;
  resolveIdentity: boolean;
}

export const NO_CAPABILITIES: ProviderCapabilities = {
  searchPlayers: false,
  getPlayer: false,
  getPlayerCareer: false,
  getPlayerSeasonStats: false,
  getPlayerMatchStats: false,
  getTeams: false,
  getTeam: false,
  getSquad: false,
  getCompetitions: false,
  getSeasons: false,
  getMatches: false,
  getTransfers: false,
  getMarketValues: false,
  getContractInformation: false,
  getRepresentationInformation: false,
  getInjuries: false,
  resolveIdentity: false,
};

// ---------------------------------------------------------------------------
// Provenance — attached to everything a provider returns
// ---------------------------------------------------------------------------

export interface Provenance {
  provider: ProviderCode;
  /** Provider-native id for this record. */
  externalId: string;
  /** Optional provider sub-namespace (e.g. Transfermarkt 'spieler'). */
  namespace?: string;
  /** Deep link a scout can open to verify by eye. */
  sourceUrl?: string;
  retrievedAt: string; // ISO-8601
  /** Untouched provider payload, persisted to source_records. */
  raw?: unknown;
}

export type WithProvenance<T> = T & { provenance: Provenance };

// ---------------------------------------------------------------------------
// Domain shapes (provider-neutral)
// ---------------------------------------------------------------------------

export type Foot = 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN';

export interface ProviderPlayer {
  externalId: string;
  fullName: string;
  shortName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  birthPlace?: string;
  nationality?: string;
  secondNationality?: string;
  heightCm?: number;
  weightKg?: number;
  foot?: Foot;
  primaryPosition?: string;
  secondaryPositions?: string[];
  currentClubName?: string;
  currentClubExternalId?: string;
  shirtNumber?: number;
  imageUrl?: string;
  isGoalkeeper?: boolean;
  isRetired?: boolean;
}

export interface ProviderClub {
  externalId: string;
  name: string;
  officialName?: string;
  shortName?: string;
  country?: string;
  city?: string;
  foundedYear?: number;
  crestUrl?: string;
  isNationalTeam?: boolean;
}

export interface ProviderCompetition {
  externalId: string;
  name: string;
  country?: string;
  areaName?: string;
  tier?: string;
  gender?: string;
  isYouth?: boolean;
}

export interface ProviderSeason {
  externalId: string;
  competitionExternalId?: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

export interface ProviderMatch {
  externalId: string;
  competitionExternalId?: string;
  seasonExternalId?: string;
  homeClubExternalId?: string;
  awayClubExternalId?: string;
  homeClubName?: string;
  awayClubName?: string;
  kickoffAt?: string;
  matchDate?: string;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  matchday?: number;
  venue?: string;
}

/**
 * Countable metrics are named fields; everything provider-specific lands in
 * `advanced` verbatim so a new upstream metric never breaks ingestion.
 */
export interface ProviderPlayerSeasonStats {
  playerExternalId: string;
  seasonExternalId?: string;
  competitionExternalId?: string;
  clubExternalId?: string;
  matchesPlayed?: number;
  matchesStarted?: number;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  xg?: number;
  xa?: number;
  shots?: number;
  shotsOnTarget?: number;
  keyPasses?: number;
  passes?: number;
  passesAccurate?: number;
  dribbles?: number;
  dribblesSuccessful?: number;
  duels?: number;
  duelsWon?: number;
  aerialDuels?: number;
  aerialDuelsWon?: number;
  interceptions?: number;
  tackles?: number;
  clearances?: number;
  progressivePasses?: number;
  progressiveCarries?: number;
  touchesInBox?: number;
  saves?: number;
  goalsConceded?: number;
  cleanSheets?: number;
  advanced?: Record<string, unknown>;
}

export interface ProviderCareerEntry {
  playerExternalId: string;
  clubExternalId?: string;
  clubName?: string;
  competitionExternalId?: string;
  competitionName?: string;
  seasonExternalId?: string;
  seasonName?: string;
  startDate?: string;
  endDate?: string;
  isLoan?: boolean;
  isCurrent?: boolean;
  appearances?: number;
  goals?: number;
  minutesPlayed?: number;
}

export interface ProviderTransfer {
  playerExternalId: string;
  fromClubExternalId?: string;
  toClubExternalId?: string;
  fromClubName?: string;
  toClubName?: string;
  transferDate?: string;
  seasonName?: string;
  transferType?: string;
  feeAmount?: number;
  feeCurrency?: string;
  isLoan?: boolean;
  isFree?: boolean;
  marketValueAtTransfer?: number;
}

export interface ProviderMarketValue {
  playerExternalId: string;
  valueAmount: number;
  currency: string;
  valuedOn: string; // YYYY-MM-DD
  clubName?: string;
  ageAtValuation?: number;
}

export interface ProviderContract {
  playerExternalId: string;
  clubExternalId?: string;
  clubName?: string;
  startDate?: string;
  expiresOn?: string;
  optionUntil?: string;
  isLoan?: boolean;
  loanExpiresOn?: string;
  status?: string;
}

/**
 * Representation information as DISPLAYED by the source.
 *
 * `status` must reflect what the page actually showed. An absent agency is
 * recorded as NO_AGENCY_LISTED — which is a statement about the source, not a
 * claim that the player is unrepresented. Conflating those two would be the
 * single most dangerous error this module could make, because GBM would
 * approach players who already have representation.
 */
export interface ProviderRepresentation {
  playerExternalId: string;
  agencyName?: string;
  agentName?: string;
  status: 'KNOWN_AGENCY' | 'NO_AGENCY_LISTED' | 'UNKNOWN' | 'CONFLICTING';
}

export interface ProviderInjury {
  playerExternalId: string;
  description?: string;
  injuryType?: string;
  startedOn?: string;
  expectedReturnOn?: string;
  endedOn?: string;
  gamesMissed?: number;
}

/** A resolved cross-provider identity, as returned by a registry like Reep. */
export interface ResolvedIdentity {
  canonicalId: string;
  entityType: 'PLAYER' | 'CLUB' | 'COMPETITION' | 'SEASON' | 'COACH';
  name?: string;
  dateOfBirth?: string;
  /** provider code -> provider-native id */
  providerIds: Partial<Record<ProviderCode, string>>;
  confidence: number;
}

export interface PlayerSearchQuery {
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  clubName?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// The provider interface
// ---------------------------------------------------------------------------

export interface FootballDataProvider {
  readonly code: ProviderCode;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Whether this provider is usable right now (credentials present, etc).
   * Callers should check this before planning an enrichment run so a missing
   * API key surfaces as "not configured" rather than a runtime exception.
   */
  isConfigured(): boolean;

  /** Cheap connectivity/auth probe. Must not consume meaningful quota. */
  healthCheck?(): Promise<ProviderHealth>;

  searchPlayers?(query: PlayerSearchQuery): Promise<WithProvenance<ProviderPlayer>[]>;
  getPlayer?(externalId: string): Promise<WithProvenance<ProviderPlayer> | null>;
  getPlayerCareer?(externalId: string): Promise<WithProvenance<ProviderCareerEntry>[]>;
  getPlayerSeasonStats?(
    externalId: string,
    opts?: { competitionExternalId?: string; seasonExternalId?: string },
  ): Promise<WithProvenance<ProviderPlayerSeasonStats>[]>;
  getPlayerMatchStats?(externalId: string): Promise<WithProvenance<unknown>[]>;

  getTeam?(externalId: string): Promise<WithProvenance<ProviderClub> | null>;
  getSquad?(
    externalId: string,
    opts?: { seasonExternalId?: string },
  ): Promise<WithProvenance<ProviderPlayer>[]>;

  getCompetitions?(opts?: { areaCode?: string }): Promise<WithProvenance<ProviderCompetition>[]>;
  getSeasons?(competitionExternalId: string): Promise<WithProvenance<ProviderSeason>[]>;
  getSeasonPlayers?(seasonExternalId: string): Promise<WithProvenance<ProviderPlayer>[]>;
  getSeasonTeams?(seasonExternalId: string): Promise<WithProvenance<ProviderClub>[]>;
  getMatches?(seasonExternalId: string): Promise<WithProvenance<ProviderMatch>[]>;

  getTransfers?(playerExternalId: string): Promise<WithProvenance<ProviderTransfer>[]>;
  getMarketValues?(playerExternalId: string): Promise<WithProvenance<ProviderMarketValue>[]>;
  getContractInformation?(
    playerExternalId: string,
  ): Promise<WithProvenance<ProviderContract> | null>;
  getRepresentationInformation?(
    playerExternalId: string,
  ): Promise<WithProvenance<ProviderRepresentation> | null>;
  getInjuries?(playerExternalId: string): Promise<WithProvenance<ProviderInjury>[]>;

  /** Registry providers (Reep, Wikidata) resolve one provider id to many. */
  resolveIdentity?(
    provider: ProviderCode,
    externalId: string,
    entityType?: 'PLAYER' | 'CLUB' | 'COMPETITION',
  ): Promise<ResolvedIdentity | null>;
}

export interface ProviderHealth {
  provider: ProviderCode;
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  message: string;
  /** Endpoints the credentials were actually observed to permit. */
  permissions?: string[];
  checkedAt: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderCode,
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor(provider: ProviderCode, missing: string[]) {
    super(provider, `Not configured. Missing environment variables: ${missing.join(', ')}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
