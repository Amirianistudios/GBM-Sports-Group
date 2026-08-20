/**
 * Dataset acquisition for dcaribou/transfermarkt-datasets.
 *
 * The project publishes weekly to an R2 bucket as per-table `.csv.gz` plus a
 * combined `.zip` and `.duckdb`. GBM pulls the per-table files: they can be
 * fetched selectively and revalidated with a cheap HEAD, so a refresh check
 * costs one round trip rather than 228 MB.
 *
 * Every download records a manifest under `data/manifests/`. That file is
 * tracked in Git, so a run's exact dataset version is reproducible from the
 * repository alone.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { paths } from './env.js';

export const R2_BASE = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data';

/** Tables in dependency order — referenced entities before the rows citing them. */
export const TM_TABLES = [
  'countries',
  'competitions',
  'clubs',
  'players',
  'player_valuations',
  'transfers',
  'games',
  'club_games',
  'appearances',
  'game_lineups',
  'game_events',
  'national_teams',
] as const;

export type TmTable = (typeof TM_TABLES)[number];

/** Tables GBM currently normalises. The rest are downloaded only on request. */
export const CORE_TABLES: TmTable[] = [
  'countries',
  'competitions',
  'clubs',
  'players',
  'player_valuations',
  'transfers',
];

/** Additional tables required by the season-statistics aggregation. */
export const STATS_TABLES: TmTable[] = ['games', 'appearances'];

export interface TableStamp {
  table: string;
  bytes: number;
  lastModified: string | null;
  etag: string | null;
}

export interface Manifest {
  provider: 'TRANSFERMARKT_DATASET';
  source: string;
  datasetVersion: string;
  fetchedAt: string;
  tables: TableStamp[];
}

const MANIFEST_FILE = () => resolve(paths.manifests(), 'transfermarkt.json');

export async function readManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST_FILE(), 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

export async function writeManifest(m: Manifest): Promise<void> {
  await mkdir(paths.manifests(), { recursive: true });
  await writeFile(MANIFEST_FILE(), JSON.stringify(m, null, 2) + '\n', 'utf8');
}

/** Cheap remote revalidation: HEAD returns size and Last-Modified without a body. */
export async function headTable(table: string): Promise<TableStamp> {
  const res = await fetch(`${R2_BASE}/${table}.csv.gz`, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HEAD ${table}.csv.gz failed: ${res.status} ${res.statusText}`);
  return {
    table,
    bytes: Number(res.headers.get('content-length') ?? 0),
    lastModified: res.headers.get('last-modified'),
    etag: res.headers.get('etag'),
  };
}

/**
 * Compares the published dataset against the manifest of what we last ingested.
 * The dataset version is the newest Last-Modified across the tables checked.
 */
export async function checkForUpdate(tables: TmTable[] = CORE_TABLES): Promise<{
  remoteVersion: string;
  localVersion: string | null;
  hasUpdate: boolean;
  stamps: TableStamp[];
}> {
  const stamps = await Promise.all(tables.map(headTable));
  const remoteVersion = versionOf(stamps);
  const local = await readManifest();
  return {
    remoteVersion,
    localVersion: local?.datasetVersion ?? null,
    hasUpdate: local?.datasetVersion !== remoteVersion,
    stamps,
  };
}

function versionOf(stamps: TableStamp[]): string {
  const times = stamps
    .map((s) => (s.lastModified ? Date.parse(s.lastModified) : 0))
    .filter((t) => t > 0);
  if (times.length === 0) return 'unknown';
  return new Date(Math.max(...times)).toISOString().slice(0, 10);
}

/** Downloads the given tables, streaming to disk so memory stays flat. */
export async function download(
  tables: TmTable[] = CORE_TABLES,
  log: (m: string) => void = console.log,
): Promise<Manifest> {
  const dir = paths.transfermarkt();
  await mkdir(dir, { recursive: true });

  const stamps: TableStamp[] = [];
  for (const table of tables) {
    const url = `${R2_BASE}/${table}.csv.gz`;
    const target = resolve(dir, `${table}.csv.gz`);
    const head = await headTable(table);

    // Skip when the local file already matches the published size exactly.
    const local = await stat(target).catch(() => null);
    if (local && local.size === head.bytes) {
      log(`  ${table.padEnd(18)} up to date (${mb(head.bytes)})`);
      stamps.push(head);
      continue;
    }

    log(`  ${table.padEnd(18)} downloading ${mb(head.bytes)} …`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`GET ${url} failed: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
    stamps.push(head);
  }

  const manifest: Manifest = {
    provider: 'TRANSFERMARKT_DATASET',
    source: 'https://github.com/dcaribou/transfermarkt-datasets',
    datasetVersion: versionOf(stamps),
    fetchedAt: new Date().toISOString(),
    tables: stamps,
  };
  await writeManifest(manifest);
  return manifest;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
