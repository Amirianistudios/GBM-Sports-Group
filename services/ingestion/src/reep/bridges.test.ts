import { describe, expect, it } from 'vitest';
import { REEP_PLAYER_BRIDGES } from './resolve.js';

/**
 * The Reep bridge map decides which provider a cross-reference is written
 * under. Getting an entry wrong does not fail — it writes a confident,
 * plausible, wrong id into `player_external_ids` at confidence 0.99, and
 * nothing downstream can tell.
 *
 * These tests pin the two things that would cause that:
 *
 *   · mapping the `fm` slug, whose ids are not FotMob's;
 *   · mapping a provider under the wrong namespace, which silently matches
 *     nothing — an earlier revision matched 0 of 5.2M bridges because it
 *     assumed every provider used `player`.
 */
describe('Reep player bridge map', () => {
  it('never maps the ambiguous `fm` slug', () => {
    // `fm` has 141,801 player bridges and 76% coverage of a GBM sample — the
    // largest gain on offer, and the reason this is worth a test. It is not
    // FotMob: FotMob ids are ~6 digits, `fm` ids are 8 and 10, and Kevin De
    // Bruyne's real FotMob id (172780) is absent from the set. The shape
    // matches Football Manager.
    expect(REEP_PLAYER_BRIDGES).not.toHaveProperty('fm');
    expect(Object.values(REEP_PLAYER_BRIDGES).map((b) => b.provider)).not.toContain('FOTMOB');
  });

  it('does not invent a Sofascore bridge', () => {
    // Zero rows in the register under any namespace. GBM's Sofascore ids come
    // from its own collection; a bridge here would be fabricated.
    expect(REEP_PLAYER_BRIDGES).not.toHaveProperty('sofascore');
    expect(Object.values(REEP_PLAYER_BRIDGES).map((b) => b.provider)).not.toContain('SOFASCORE');
  });

  it('uses each provider\'s own namespace, not a blanket `player`', () => {
    // Surveyed from the release. Transfermarkt keys on its URL segment, the
    // Opta-family providers on `person`, StatsBomb on `offline_player`.
    expect(REEP_PLAYER_BRIDGES.transfermarkt).toEqual({
      namespace: 'spieler',
      provider: 'TRANSFERMARKT',
    });
    expect(REEP_PLAYER_BRIDGES.statsbomb.namespace).toBe('offline_player');
    for (const slug of ['fbref', 'opta', 'fifa', 'espn']) {
      expect(REEP_PLAYER_BRIDGES[slug]?.namespace).toBe('person');
    }
    for (const slug of ['wyscout', 'api_football', 'sportmonks', 'understat', 'besoccer', 'uefa', 'capology']) {
      expect(REEP_PLAYER_BRIDGES[slug]?.namespace).toBe('player');
    }
  });

  it('maps every slug to a distinct provider code', () => {
    const providers = Object.values(REEP_PLAYER_BRIDGES).map((b) => b.provider);
    expect(new Set(providers).size).toBe(providers.length);
  });

  it('only names providers the database registers', () => {
    // player_external_ids.provider_code is a foreign key into data_providers.
    // A slug mapped to an unregistered code fails the whole resolve at insert
    // time, after the register has been downloaded and scanned.
    const registered = new Set([
      'GBM_INTERNAL', 'WYSCOUT', 'REEP', 'CLUB', 'FEDERATION', 'TRANSFERMARKT',
      'TRANSFERMARKT_DATASET', 'FBREF', 'THE_ANALYST', 'IMPECT', 'SOFASCORE',
      'STATSBOMB', 'FOTMOB', 'BESOCCER', 'SPORTMONKS', 'UNDERSTAT',
      'API_FOOTBALL', 'SPORTDB', 'CLAUDE_COWORK', 'WIKIDATA', 'AVENGERS_GROK',
      // Registered by migration 20260902100000.
      'OPTA', 'FIFA', 'UEFA', 'ESPN', 'CAPOLOGY',
    ]);
    for (const [slug, bridge] of Object.entries(REEP_PLAYER_BRIDGES)) {
      expect(registered.has(bridge.provider), `${slug} → ${bridge.provider}`).toBe(true);
    }
  });

  it('keeps the seven original providers mapped', () => {
    // Removing one silently stops enriching it; the count is the cheap guard.
    for (const slug of [
      'transfermarkt', 'wyscout', 'api_football', 'sportmonks',
      'fbref', 'understat', 'statsbomb',
    ]) {
      expect(REEP_PLAYER_BRIDGES, slug).toHaveProperty(slug);
    }
    expect(Object.keys(REEP_PLAYER_BRIDGES).length).toBeGreaterThanOrEqual(13);
  });
});
