/**
 * REEP ENTITY RESOLUTION
 * ---------------------------------------------------------------------------
 * Reep is a register that maps one football identity onto its ids at 40+
 * providers. GBM uses the downloadable v0 register (CC0, derived from
 * Wikidata) rather than the metered v1 API: one file gives deterministic
 * mappings for 444k people with no key and no rate limit.
 *
 * The join is exact — Transfermarkt id to Transfermarkt id — so every mapping
 * written here is confidence 1.000 and match_method 'REEP'. Nothing fuzzy is
 * inferred; a player Reep does not know simply gains no new identities.
 *
 * Reep bootstraps GBM's identity graph. It does not own it: these ids live in
 * player_external_ids beside every other provider, and players.id remains the
 * canonical GBM identity.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { readRows, str } from '../csv.js';
import { paths } from '../env.js';
import { admin, selectAll, upsertChunked } from '../supabase.js';
import type { IngestionRun } from '../run.js';

/** v0 register, frozen at data version 2026.25. */
const REGISTER_BASE = 'https://raw.githubusercontent.com/withqwerty/reep/main/data';

/**
 * Reep column → GBM provider code. Only providers GBM has registered in
 * `data_providers` are mapped; the register carries ~40 more (Opta, WhoScored,
 * Soccerway, Flashscore …) which are deliberately left out until GBM has a
 * reason to consume them.
 */
export const REEP_COLUMN_TO_PROVIDER: Record<string, string> = {
  key_sofascore: 'SOFASCORE',
  key_fotmob: 'FOTMOB',
  key_wyscout: 'WYSCOUT',
  key_fbref: 'FBREF',
  key_understat: 'UNDERSTAT',
  key_besoccer: 'BESOCCER',
  key_sportmonks: 'SPORTMONKS',
  key_api_football: 'API_FOOTBALL',
  key_impect: 'IMPECT',
  key_wikidata: 'WIKIDATA',
};

/**
 * Public profile URLs, built only where the pattern is stable and verifiable.
 * A provider absent from this map still gets its id stored — GBM just does not
 * claim to know where the page lives.
 */
const PROFILE_URL: Record<string, (id: string) => string> = {
  SOFASCORE: (id) => `https://www.sofascore.com/player/-/${id}`,
  FOTMOB: (id) => `https://www.fotmob.com/players/${id}`,
  FBREF: (id) => `https://fbref.com/en/players/${id}/`,
  UNDERSTAT: (id) => `https://understat.com/player/${id}`,
  WIKIDATA: (id) => `https://www.wikidata.org/wiki/${id}`,
};

async function ensureRegister(log: (m: string) => void): Promise<{ path: string; gzipped: boolean }> {
  const dir = paths.reep();
  await mkdir(dir, { recursive: true });
  const target = resolve(dir, 'people.csv');

  const local = await stat(target).catch(() => null);
  if (local && local.size > 1_000_000) {
    log(`  register         cached (${(local.size / 1024 / 1024).toFixed(1)} MB)`);
    return { path: target, gzipped: false };
  }

  log('  register         downloading Reep v0 people register …');
  const res = await fetch(`${REGISTER_BASE}/people.csv`);
  if (!res.ok || !res.body) throw new Error(`Reep register download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
  return { path: target, gzipped: false };
}

export interface ResolveResult {
  scanned: number;
  matchedPlayers: number;
  identitiesWritten: number;
  byProvider: Record<string, number>;
}

export async function resolveThroughReep(
  run: IngestionRun,
  log: (m: string) => void = console.log,
): Promise<ResolveResult> {
  const file = await ensureRegister(log);

  // Every GBM player that carries a Transfermarkt id is a candidate.
  const tmLinks = await selectAll<{ external_id: string; player_id: string }>(
    'player_external_ids',
    'external_id, player_id',
    (q) => q.eq('provider_code', 'TRANSFERMARKT_DATASET'),
  );
  const byTm = new Map(tmLinks.map((r) => [r.external_id, r.player_id]));
  log(`  candidates       ${byTm.size} players with a Transfermarkt id`);

  // Identities already known, so a re-run reports genuinely new mappings.
  const existing = await selectAll<{ player_id: string; provider_code: string }>(
    'player_external_ids',
    'player_id, provider_code',
  );
  const known = new Set(existing.map((r) => `${r.player_id}|${r.provider_code}`));

  const rows: Record<string, unknown>[] = [];
  const byProvider: Record<string, number> = {};
  const matched = new Set<string>();
  let scanned = 0;
  const now = new Date().toISOString();

  for await (const r of readRows(file)) {
    scanned += 1;
    const tmId = str(r.key_transfermarkt);
    if (!tmId) continue;
    const playerId = byTm.get(tmId);
    if (!playerId) continue;
    matched.add(playerId);

    for (const [column, provider] of Object.entries(REEP_COLUMN_TO_PROVIDER)) {
      const value = str(r[column]);
      if (!value) continue;
      if (known.has(`${playerId}|${provider}`)) continue;
      known.add(`${playerId}|${provider}`);

      rows.push({
        player_id: playerId,
        provider_code: provider,
        namespace: null,
        external_id: value,
        url: PROFILE_URL[provider]?.(value) ?? null,
        confidence: 1.0,
        match_method: 'REEP',
        verified_at: now,
      });
      byProvider[provider] = (byProvider[provider] ?? 0) + 1;
    }

    // Reep v0 is keyed on Wikidata, so the QID is that register's canonical
    // identifier for this person. Recorded under REEP with an explicit
    // namespace rather than inventing a reep_* id the v0 file does not carry.
    const qid = str(r.key_wikidata);
    if (qid && !known.has(`${playerId}|REEP`)) {
      known.add(`${playerId}|REEP`);
      rows.push({
        player_id: playerId,
        provider_code: 'REEP',
        namespace: 'v0-wikidata',
        external_id: qid,
        url: `https://reep.football/entity/${qid}`,
        confidence: 1.0,
        match_method: 'REEP',
        verified_at: now,
      });
      byProvider.REEP = (byProvider.REEP ?? 0) + 1;
    }
  }

  const written = await upsertChunked('player_external_ids', rows, {
    onConflict: 'provider_code,namespace,external_id',
    ignoreDuplicates: true,
    label: 'player_external_ids',
  });

  // Players resolved across more providers are more trustworthy identities.
  await bumpConfidence([...matched]);

  run.count({ fetched: scanned, created: written });
  run.note('reep', { matchedPlayers: matched.size, byProvider });
  log(`  matched          ${matched.size} players, ${written} new identities`);
  for (const [p, n] of Object.entries(byProvider).sort((a, b) => b[1] - a[1])) {
    log(`    ${p.padEnd(16)} ${n}`);
  }

  return { scanned, matchedPlayers: matched.size, identitiesWritten: written, byProvider };
}

/**
 * data_confidence expresses how well-resolved an identity is. A player known
 * to five providers has been corroborated in a way a Transfermarkt-only row
 * has not, and the player page surfaces that difference.
 */
async function bumpConfidence(playerIds: string[]): Promise<void> {
  for (let i = 0; i < playerIds.length; i += 500) {
    const slice = playerIds.slice(i, i + 500);
    const { error } = await admin().rpc('gbm_recompute_data_confidence', { player_ids: slice });
    if (error) {
      // The helper is optional; a missing function must not fail the run.
      if (/does not exist|not find/i.test(error.message)) return;
      throw new Error(`data_confidence update failed — ${error.message}`);
    }
  }
}
