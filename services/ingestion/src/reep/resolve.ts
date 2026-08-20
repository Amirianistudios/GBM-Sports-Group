/**
 * REEP ENTITY RESOLUTION — v1 register
 * ---------------------------------------------------------------------------
 * Reep is a canonical football identity register mapping one entity onto its
 * ids at ~54 providers. GBM consumes the downloadable v1 release
 * (data.reep.football, CC0 1.0 — the licence ships inside the release):
 * weekly, no key, no rate limit, pinned here by release stamp and checksum so
 * every resolve is attributable to an exact register version.
 *
 * v1 replaces the frozen v0 register (last data 2026.25, 21 June 2026) this
 * module previously consumed. v0 rows already written to player_external_ids
 * (provider REEP, namespace 'v0-wikidata', plus provider ids with
 * match_method 'REEP') are retained as provenance, never deleted; the
 * namespace separates the generations.
 *
 * The join discipline is unchanged and load-bearing: EXACT joins only —
 * Transfermarkt id to Transfermarkt id through bridges.csv. Nothing fuzzy is
 * auto-written. The release's overlay_xids file is deliberately NOT consumed:
 * its rows carry confidence 0.85, below the auto-accept floor in
 * entity_resolution_rules, so admitting them wholesale would breach the very
 * threshold system that keeps the identity graph trustworthy. (They would
 * belong in entity_resolution_candidates for human review, a later step.)
 *
 * Reep bootstraps GBM's identity graph. It does not own it: these ids live in
 * player_external_ids beside every other provider, and players.id remains the
 * canonical GBM identity.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { readRows, str } from '../csv.js';
import { paths } from '../env.js';
import { admin, selectAll, upsertChunked } from '../supabase.js';
import type { IngestionRun } from '../run.js';

const LATEST_MANIFEST_URL = 'https://data.reep.football/releases/latest.json';

/** Match method + confidence follow the seeded entity_resolution_rules row. */
const MATCH_METHOD = 'REEP_REGISTER';
const CONFIDENCE = 0.99;

/**
 * Register provider slug → GBM provider code. Only providers registered in
 * `data_providers` are mapped; the register carries ~40 more (Opta, WhoScored,
 * Soccerway, Flashscore …) which are deliberately left out until GBM has a
 * reason to consume them. Unmapped slugs are counted and reported, never
 * guessed.
 */
export const REEP_SLUG_TO_PROVIDER: Record<string, string> = {
  transfermarkt: 'TRANSFERMARKT',
  sofascore: 'SOFASCORE',
  fotmob: 'FOTMOB',
  wyscout: 'WYSCOUT',
  fbref: 'FBREF',
  understat: 'UNDERSTAT',
  besoccer: 'BESOCCER',
  sportmonks: 'SPORTMONKS',
  api_football: 'API_FOOTBALL',
  impect: 'IMPECT',
  wikidata: 'WIKIDATA',
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
  TRANSFERMARKT: (id) => `https://www.transfermarkt.com/-/profil/spieler/${id}`,
};

interface ReleaseFile {
  bytes: number;
  rows?: number;
  sha256: string;
  url: string;
}

interface Release {
  stamp: string;
  generatedAt: string | null;
  files: Record<string, ReleaseFile>;
}

interface ReepManifest {
  provider: 'REEP';
  registerVersion: 'v1';
  stamp: string;
  releaseGeneratedAt: string | null;
  fetchedAt: string;
  files: Record<string, { bytes: number; rows?: number; sha256: string }>;
}

const MANIFEST_FILE = () => resolve(paths.manifests(), 'reep.json');

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Resolves the latest published release: stamp plus per-file checksums. */
async function latestRelease(): Promise<Release> {
  const latest = await fetchJson(LATEST_MANIFEST_URL);
  const stamp = String(latest.stamp ?? '');
  const manifestUrl = String(latest.manifest_url ?? '');
  if (!stamp || !manifestUrl) {
    throw new Error(`Reep latest.json is missing stamp/manifest_url — got keys ${Object.keys(latest).join(', ')}`);
  }
  const release = await fetchJson(manifestUrl);
  const files = (release.files ?? {}) as Record<string, ReleaseFile>;
  if (!files['csv/bridges.csv.gz']) {
    throw new Error(`Reep release ${stamp} does not list csv/bridges.csv.gz — refusing to guess its location.`);
  }
  return { stamp, generatedAt: (release.release_generated_at as string) ?? null, files };
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/**
 * Downloads one release file into data/reep/, verifying its checksum. A file
 * already present with the right hash is reused, so re-runs inside one release
 * week cost nothing.
 */
async function ensureFile(
  release: Release,
  key: string,
  log: (m: string) => void,
): Promise<string> {
  const meta = release.files[key];
  if (!meta) throw new Error(`Reep release ${release.stamp} does not list ${key}.`);

  const dir = paths.reep();
  await mkdir(dir, { recursive: true });
  const base = key.split('/').pop()!;
  const target = resolve(dir, `${release.stamp}-${base}`);

  const local = await stat(target).catch(() => null);
  if (local && local.size === meta.bytes && (await sha256Of(target)) === meta.sha256) {
    log(`  ${base.padEnd(22)} cached (${mb(meta.bytes)})`);
    return target;
  }

  log(`  ${base.padEnd(22)} downloading ${mb(meta.bytes)} …`);
  const res = await fetch(meta.url);
  if (!res.ok || !res.body) throw new Error(`GET ${meta.url} failed: ${res.status}`);
  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));

  const digest = await sha256Of(tmp);
  if (digest !== meta.sha256) {
    await rm(tmp, { force: true });
    throw new Error(
      `Checksum mismatch for ${key} in release ${release.stamp}: expected ${meta.sha256}, got ${digest}.`,
    );
  }
  await rename(tmp, target);
  return target;
}

async function writeManifest(release: Release, used: string[]): Promise<void> {
  const manifest: ReepManifest = {
    provider: 'REEP',
    registerVersion: 'v1',
    stamp: release.stamp,
    releaseGeneratedAt: release.generatedAt,
    fetchedAt: new Date().toISOString(),
    files: Object.fromEntries(
      used.map((k) => {
        const f = release.files[k];
        return [k, { bytes: f.bytes, rows: f.rows, sha256: f.sha256 }];
      }),
    ),
  };
  await mkdir(paths.manifests(), { recursive: true });
  await writeFile(MANIFEST_FILE(), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

export async function readReepManifest(): Promise<ReepManifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST_FILE(), 'utf8')) as ReepManifest;
  } catch {
    return null;
  }
}

/** A bridges.csv row. Header validated on first row so drift fails loudly. */
interface Bridge {
  provider: string;
  namespace: string | null;
  externalId: string;
  reepId: string;
}

function parseBridge(r: Record<string, string>, seenHeader: { ok: boolean }): Bridge | null {
  if (!seenHeader.ok) {
    for (const col of ['provider', 'namespace', 'external_id', 'reep_id']) {
      if (!(col in r)) {
        throw new Error(
          `Reep bridges.csv is missing expected column '${col}' — release schema changed, refusing to guess. ` +
            `Columns seen: ${Object.keys(r).join(', ')}`,
        );
      }
    }
    seenHeader.ok = true;
  }
  const provider = str(r.provider)?.toLowerCase();
  const externalId = str(r.external_id);
  const reepId = str(r.reep_id);
  if (!provider || !externalId || !reepId) return null;
  return { provider, namespace: str(r.namespace)?.toLowerCase() ?? null, externalId, reepId };
}

/** Player-scoped bridges only; a club id colliding with a player id must not join. */
function isPlayerBridge(b: Bridge): boolean {
  return b.namespace === null || b.namespace === 'player';
}

export interface ResolveResult {
  registerStamp: string;
  bridgesScanned: number;
  matchedPlayers: number;
  identitiesWritten: number;
  redirectsApplied: number;
  byProvider: Record<string, number>;
  unmappedSlugs: Record<string, number>;
}

export async function resolveThroughReep(
  run: IngestionRun,
  log: (m: string) => void = console.log,
): Promise<ResolveResult> {
  const release = await latestRelease();
  log(`  register         Reep v1 release ${release.stamp}`);
  const bridgesFile = await ensureFile(release, 'csv/bridges.csv.gz', log);

  // Every GBM player that carries a Transfermarkt id is a candidate.
  const tmLinks = await selectAll<{ external_id: string; player_id: string }>(
    'player_external_ids',
    'external_id, player_id',
    (q) => q.eq('provider_code', 'TRANSFERMARKT_DATASET'),
  );
  const playerByTm = new Map(tmLinks.map((r) => [r.external_id, r.player_id]));
  log(`  candidates       ${playerByTm.size} players with a Transfermarkt id`);

  // Identities already known, so a re-run reports genuinely new mappings.
  // The key includes the namespace so a v1 REEP identity can coexist with the
  // retained v0-wikidata one.
  const existing = await selectAll<{
    player_id: string;
    provider_code: string;
    namespace: string | null;
    external_id: string;
  }>('player_external_ids', 'player_id, provider_code, namespace, external_id');
  const known = new Set(existing.map((r) => `${r.player_id}|${r.provider_code}|${r.namespace ?? ''}`));

  // ---- Pass 1: transfermarkt bridges → reep_id per GBM player -------------
  const seenHeader = { ok: false };
  let scanned = 0;
  const playerByReep = new Map<string, string>();

  for await (const raw of readRows({ path: bridgesFile, gzipped: true })) {
    scanned += 1;
    const b = parseBridge(raw, seenHeader);
    if (!b || b.provider !== 'transfermarkt' || !isPlayerBridge(b)) continue;
    const playerId = playerByTm.get(b.externalId);
    if (playerId) playerByReep.set(b.reepId, playerId);
  }
  log(`  pass 1           ${playerByReep.size} players matched in ${scanned} bridges`);

  // ---- Pass 2: collect every bridge for the matched entities --------------
  const rows: Record<string, unknown>[] = [];
  const byProvider: Record<string, number> = {};
  const unmappedSlugs: Record<string, number> = {};
  const matched = new Set<string>();
  const now = new Date().toISOString();

  const add = (
    playerId: string,
    provider: string,
    namespace: string | null,
    externalId: string,
    url: string | null,
  ) => {
    const key = `${playerId}|${provider}|${namespace ?? ''}`;
    if (known.has(key)) return;
    known.add(key);
    rows.push({
      player_id: playerId,
      provider_code: provider,
      namespace,
      external_id: externalId,
      url,
      confidence: CONFIDENCE,
      match_method: MATCH_METHOD,
      verified_at: now,
    });
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;
  };

  for await (const raw of readRows({ path: bridgesFile, gzipped: true })) {
    const b = parseBridge(raw, seenHeader);
    if (!b || !isPlayerBridge(b)) continue;
    const playerId = playerByReep.get(b.reepId);
    if (!playerId) continue;
    matched.add(playerId);

    const provider = REEP_SLUG_TO_PROVIDER[b.provider];
    if (!provider) {
      unmappedSlugs[b.provider] = (unmappedSlugs[b.provider] ?? 0) + 1;
      continue;
    }
    // The player's Transfermarkt id is already its reconciliation anchor
    // under TRANSFERMARKT_DATASET; re-adding it under TRANSFERMARKT records
    // that the live site id is confirmed identical.
    add(playerId, provider, null, b.externalId, PROFILE_URL[provider]?.(b.externalId) ?? null);
  }

  // The Reep v1 entity id is that register's canonical identifier — stored
  // under REEP with an explicit namespace, beside the retained v0 rows.
  for (const [reepId, playerId] of playerByReep) {
    add(playerId, 'REEP', 'v1', reepId, `https://reep.football/entity/${reepId}`);
  }

  const written = await upsertChunked('player_external_ids', rows, {
    onConflict: 'provider_code,namespace,external_id',
    ignoreDuplicates: true,
    label: 'player_external_ids',
  });

  // ---- Redirects: entities merged upstream keep their stored id current ---
  const redirectsApplied = await applyRedirects(release, log);

  await writeManifest(release, ['csv/bridges.csv.gz', 'csv/redirects.csv.gz']);

  // Players resolved across more providers are more trustworthy identities.
  await bumpConfidence([...matched]);

  run.count({ fetched: scanned, created: written });
  run.note('reep', {
    registerStamp: release.stamp,
    matchedPlayers: matched.size,
    byProvider,
    unmappedSlugs,
    redirectsApplied,
  });
  log(`  matched          ${matched.size} players, ${written} new identities`);
  for (const [p, n] of Object.entries(byProvider).sort((a, b) => b[1] - a[1])) {
    log(`    ${p.padEnd(16)} ${n}`);
  }
  const unmappedTotal = Object.values(unmappedSlugs).reduce((a, b) => a + b, 0);
  if (unmappedTotal) {
    log(`  unmapped slugs   ${unmappedTotal} bridge rows across ${Object.keys(unmappedSlugs).length} providers GBM has not registered`);
  }

  return {
    registerStamp: release.stamp,
    bridgesScanned: scanned,
    matchedPlayers: matched.size,
    identitiesWritten: written,
    redirectsApplied,
    byProvider,
    unmappedSlugs,
  };
}

/**
 * When the register merges two entities, a previously stored v1 id may be
 * redirected. Updating the stored external_id keeps GBM's pointer live; the
 * player's GBM UUID — the canonical identity — is untouched.
 */
async function applyRedirects(release: Release, log: (m: string) => void): Promise<number> {
  if (!release.files['csv/redirects.csv.gz']) return 0;
  const file = await ensureFile(release, 'csv/redirects.csv.gz', log);

  const redirect = new Map<string, string>();
  for await (const r of readRows({ path: file, gzipped: true })) {
    const from = str(r.from_id);
    const to = str(r.to_id);
    if (from && to) redirect.set(from, to);
  }
  if (redirect.size === 0) return 0;

  const stored = await selectAll<{ id: string; external_id: string }>(
    'player_external_ids',
    'id, external_id',
    (q) => q.eq('provider_code', 'REEP').eq('namespace', 'v1'),
  );

  let applied = 0;
  for (const row of stored) {
    const to = redirect.get(row.external_id);
    if (!to) continue;
    const { error } = await admin()
      .from('player_external_ids')
      .update({ external_id: to, url: `https://reep.football/entity/${to}`, verified_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) throw new Error(`redirect update failed for ${row.external_id} → ${to}: ${error.message}`);
    applied += 1;
  }
  if (applied) log(`  redirects        ${applied} stored Reep ids updated to their merged entities`);
  return applied;
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

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
