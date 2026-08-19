/**
 * REEP PROVIDER — cross-provider canonical identity register
 * ---------------------------------------------------------------------------
 * Reep (https://reep.football) maps player / team / competition identities
 * across 30+ providers including Transfermarkt, FBref, Sofascore, FotMob,
 * Wyscout, SportMonks, Opta and Understat. It is the single highest-leverage
 * shortcut for GBM's entity-resolution problem: one lookup can return a
 * player's ids on every other platform at once.
 *
 * IMPORTANT — Reep is a BOOTSTRAP, not the source of truth.
 * Reep ids are stored in player_external_ids like any other provider. GBM's
 * canonical id remains players.id. If Reep disappeared tomorrow the identity
 * graph GBM has already built would survive intact.
 *
 * Two access modes:
 *   1. REGISTER (preferred for bulk) — downloadable CSV/DuckDB, CC0 licensed.
 *      No API key. Best for seeding tens of thousands of mappings offline.
 *   2. API (per-lookup) — https://reep.football/api/v1/..., Bearer token.
 *      Requires a key from https://reep.football/partners.
 *
 * Verified 2026-08-19: the v1 API returns 401 without a key.
 */

import { HttpClient } from '../http.js';
import {
  FootballDataProvider,
  NO_CAPABILITIES,
  ProviderCapabilities,
  ProviderCode,
  ProviderHealth,
  ResolvedIdentity,
  nowIso,
} from '../types.js';

const CAPABILITIES: ProviderCapabilities = {
  ...NO_CAPABILITIES,
  resolveIdentity: true,
  searchPlayers: true,
};

/**
 * Maps GBM provider codes onto Reep's provider namespace keys.
 * Reep exposes these as `key_<provider>` columns in the CSV register and as
 * path segments in the resolve API.
 */
export const REEP_PROVIDER_KEYS: Partial<Record<ProviderCode, string>> = {
  TRANSFERMARKT: 'transfermarkt',
  WYSCOUT: 'wyscout',
  SOFASCORE: 'sofascore',
  FOTMOB: 'fotmob',
  FBREF: 'fbref',
  UNDERSTAT: 'understat',
  SPORTMONKS: 'sportmonks',
  API_FOOTBALL: 'api_football',
  IMPECT: 'impect',
  WIKIDATA: 'wikidata',
};

/** Inverse map: Reep key -> GBM provider code. */
const REEP_KEY_TO_PROVIDER: Record<string, ProviderCode> = Object.fromEntries(
  Object.entries(REEP_PROVIDER_KEYS).map(([code, key]) => [key, code as ProviderCode]),
) as Record<string, ProviderCode>;

interface ReepResolveResponse {
  reep_id?: string;
  type?: string;
  name?: string;
  date_of_birth?: string;
  confidence?: number | string;
  keys?: Record<string, string | number | null>;
  // Some responses inline keys as key_<provider> fields.
  [k: string]: unknown;
}

export interface ReepConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class ReepProvider implements FootballDataProvider {
  readonly code = 'REEP' as const;
  readonly name = 'Reep Football Register';
  readonly capabilities = CAPABILITIES;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(config: ReepConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.REEP_API_KEY;
    this.baseUrl = (config.baseUrl ?? process.env.REEP_BASE_URL ?? 'https://reep.football')
      .replace(/\/+$/, '');

    this.http = new HttpClient({
      provider: 'REEP',
      baseUrl: this.baseUrl,
      requestsPerSecond: 5,
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      userAgent: process.env.GBM_USER_AGENT ?? 'GBM-Intelligence/0.1',
    });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = nowIso();
    if (!this.apiKey) {
      return {
        provider: this.code,
        configured: false,
        reachable: true,
        authenticated: false,
        message:
          'REEP_API_KEY not set. The live resolve API requires a key from '
          + 'https://reep.football/partners. The downloadable CC0 register can '
          + 'still be imported without one.',
        checkedAt,
      };
    }

    const started = Date.now();
    try {
      // Cole Palmer's Transfermarkt id — a stable, well-known probe subject.
      await this.resolveIdentity('TRANSFERMARKT', '568177', 'PLAYER');
      return {
        provider: this.code,
        configured: true,
        reachable: true,
        authenticated: true,
        message: 'Authenticated against the Reep v1 resolve API.',
        checkedAt,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        provider: this.code,
        configured: true,
        reachable: true,
        authenticated: false,
        message: `Reep rejected the request: ${message}`,
        checkedAt,
      };
    }
  }

  /**
   * Resolve one provider id into every other provider id Reep knows about.
   * This is the call that turns a lone Wyscout id into a full identity graph.
   */
  async resolveIdentity(
    provider: ProviderCode,
    externalId: string,
    entityType: 'PLAYER' | 'CLUB' | 'COMPETITION' = 'PLAYER',
  ): Promise<ResolvedIdentity | null> {
    const providerKey = REEP_PROVIDER_KEYS[provider];
    if (!providerKey) return null;

    const typeParam = entityType.toLowerCase();
    const data = await this.http.request<ReepResolveResponse>(
      `/api/v1/resolve/${providerKey}/${encodeURIComponent(externalId)}`,
      { query: { type: typeParam }, allowNotFound: true },
    );
    if (!data?.reep_id) return null;

    return {
      canonicalId: data.reep_id,
      entityType,
      name: data.name,
      dateOfBirth: data.date_of_birth?.slice(0, 10),
      providerIds: extractProviderIds(data),
      confidence: Number(data.confidence ?? 0.99),
    };
  }

  /** Name search against the register. Useful when no provider id is known. */
  async searchIdentities(name: string, type = 'player'): Promise<ResolvedIdentity[]> {
    const data = await this.http.request<{ results?: ReepResolveResponse[] }>('/api/v1/search', {
      query: { name, type },
      allowNotFound: true,
    });
    return (data?.results ?? [])
      .filter((r) => r.reep_id)
      .map((r) => ({
        canonicalId: r.reep_id!,
        entityType: 'PLAYER' as const,
        name: r.name,
        dateOfBirth: r.date_of_birth?.slice(0, 10),
        providerIds: extractProviderIds(r),
        confidence: Number(r.confidence ?? 0.9),
      }));
  }

  async searchPlayers() {
    // Reep is an identity register, not a player database: it has no bios or
    // statistics to return in ProviderPlayer shape. Callers should use
    // searchIdentities() instead.
    return [];
  }

  /**
   * URL of the downloadable CC0 register. Preferred for bulk seeding because
   * it needs no API key and imports tens of thousands of mappings in one pass.
   */
  registerDownloadUrl(format: 'csv' | 'duckdb' = 'csv'): string {
    return `${this.baseUrl}/downloads${format === 'duckdb' ? '?format=duckdb' : ''}`;
  }
}

/**
 * Reep returns provider ids either nested under `keys` or flattened as
 * `key_<provider>` columns depending on endpoint and format. Handle both.
 */
function extractProviderIds(data: ReepResolveResponse): Partial<Record<ProviderCode, string>> {
  const out: Partial<Record<ProviderCode, string>> = {};

  for (const [key, value] of Object.entries(data.keys ?? {})) {
    const code = REEP_KEY_TO_PROVIDER[key];
    if (code && value != null && value !== '') out[code] = String(value);
  }

  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('key_')) continue;
    const code = REEP_KEY_TO_PROVIDER[key.slice(4)];
    if (code && value != null && value !== '') out[code] = String(value);
  }

  return out;
}
