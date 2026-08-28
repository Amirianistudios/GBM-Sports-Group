#!/usr/bin/env tsx
/**
 * GBM INTELLIGENCE — INGESTION CLI
 *
 *   pnpm data:download                 fetch the published Transfermarkt dataset
 *   pnpm data:import  [--max-players N] [--since-season Y] [--skip-valuations]
 *   pnpm data:update                   download if newer, then import + resolve + signals
 *   pnpm reep:resolve                  attach cross-provider identities via Reep
 *   pnpm recovery:merged-players       re-ingest the survivors of the defective merge
 *   pnpm signals:compute               recompute discovery signals
 *   pnpm quality:check                 report data quality
 *   pnpm ingest:status                 recent runs and row counts
 *
 * Every command that writes opens an `ingestion_runs` row, so the database
 * always records what happened even when a run dies halfway.
 */
import { CORE_TABLES, STATS_TABLES, checkForUpdate, download, readManifest } from './dataset.js';
import { importTransfermarkt } from './transfermarkt/import.js';
import { resolveThroughReep } from './reep/resolve.js';
import { recoverMergedPlayers } from './transfermarkt/recovery.js';
import { runQualityChecks } from './quality.js';
import { runPreflight } from './preflight.js';
import { verifyEndToEnd } from './verify.js';
import { runHourlyIntelligence } from './intelligence/hourly.js';
import { IngestionRun } from './run.js';
import { admin } from './supabase.js';

const log = (m = '') => console.log(m);

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function option(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = Number.parseInt(process.argv[i + 1] ?? '', 10);
  return Number.isFinite(v) ? v : undefined;
}

function tablesToDownload() {
  return flag('skip-stats') ? CORE_TABLES : [...CORE_TABLES, ...STATS_TABLES];
}

async function cmdDownload(): Promise<void> {
  log('Transfermarkt dataset — checking published version');
  const status = await checkForUpdate();
  log(`  published        ${status.remoteVersion}`);
  log(`  ingested         ${status.localVersion ?? 'never'}`);
  log('');
  const manifest = await download(tablesToDownload(), log);
  log('');
  log(`Dataset ${manifest.datasetVersion} ready in data/transfermarkt/`);
}

async function cmdImport(): Promise<void> {
  const manifest = await readManifest();
  const opts = {
    maxPlayers: option('max-players'),
    sinceSeason: option('since-season'),
    skipValuations: flag('skip-valuations'),
    skipTransfers: flag('skip-transfers'),
    skipStats: flag('skip-stats'),
    log,
  };

  log('Transfermarkt import');
  log(`  dataset version  ${manifest?.datasetVersion ?? 'unknown (run data:download)'}`);
  log('');

  await IngestionRun.wrap(
    'transfermarkt_dataset_update',
    {
      providerCode: 'TRANSFERMARKT_DATASET',
      params: { ...opts, log: undefined, datasetVersion: manifest?.datasetVersion ?? null },
    },
    async (run) => {
      run.note('datasetVersion', manifest?.datasetVersion ?? null);
      const result = await importTransfermarkt(run, opts);
      log('');
      log(`Imported ${result.players} players across ${result.clubs} clubs.`);
      return result;
    },
  );
}

async function cmdResolve(): Promise<void> {
  log('Reep entity resolution');
  await IngestionRun.wrap('entity_resolution', { providerCode: 'REEP' }, async (run) => {
    await resolveThroughReep(run, log);
  });
}

async function cmdRecover(): Promise<void> {
  log('Merge recovery — targeted re-ingestion for the merge survivors');
  log('');
  await IngestionRun.wrap(
    'merge_recovery',
    { providerCode: 'TRANSFERMARKT_DATASET' },
    async (run) => {
      const r = await recoverMergedPlayers(run, log);
      log('');
      log(
        `${r.attempted} survivors attempted (${r.recoverable} recoverable); ` +
          `${r.stillFlagged} remain below population coverage.`,
      );
    },
  );
}

async function cmdSignals(): Promise<void> {
  log('Discovery signals');
  await IngestionRun.wrap('discovery_signals', {}, async (run) => {
    const { data, error } = await admin().rpc('gbm_compute_discovery_signals');
    if (error) throw new Error(`signal computation failed — ${error.message}`);
    let total = 0;
    for (const row of (data ?? []) as { signal_type: string; inserted: number }[]) {
      log(`  ${row.signal_type.padEnd(30)} ${row.inserted}`);
      total += row.inserted;
    }
    run.count({ created: total });
    run.note('signals', data);
    log('');
    log(`${total} current signals.`);
  });
}

async function cmdQuality(): Promise<void> {
  log('Data quality');
  const checks = await runQualityChecks();
  for (const c of checks) {
    log(`  ${c.ok ? 'ok  ' : 'WARN'}  ${c.name.padEnd(40)} ${String(c.count).padStart(8)}`);
    if (!c.ok) log(`        ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  log('');
  log(failed.length === 0 ? 'All checks passed.' : `${failed.length} check(s) need attention.`);
}

async function cmdStatus(): Promise<void> {
  const manifest = await readManifest();
  log('Dataset');
  log(`  transfermarkt    ${manifest?.datasetVersion ?? 'not downloaded'}`);
  log('');

  const { data: runs } = await admin()
    .from('ingestion_runs')
    .select('job_key, status, started_at, finished_at, records_created, records_updated, error_count')
    .order('started_at', { ascending: false })
    .limit(10);

  log('Recent ingestion runs');
  if (!runs?.length) log('  none');
  for (const r of runs ?? []) {
    log(
      `  ${String(r.started_at).slice(0, 19).replace('T', ' ')}  ${String(r.job_key).padEnd(30)}` +
        ` ${String(r.status).padEnd(8)} +${r.records_created}/~${r.records_updated} err:${r.error_count}`,
    );
  }

  log('');
  log('Row counts');
  for (const t of [
    'players', 'player_external_ids', 'clubs', 'competitions', 'countries',
    'market_values', 'contracts', 'representation_records', 'transfers',
    'discovery_signals', 'ingestion_runs',
  ]) {
    const { count } = await admin().from(t).select('*', { count: 'exact', head: true });
    log(`  ${t.padEnd(24)} ${String(count ?? 0).padStart(9)}`);
  }
}

async function cmdPreflight(): Promise<void> {
  log('Preflight');
  const checks = await runPreflight({ offline: flag('offline') });
  for (const c of checks) {
    log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(32)} ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  log('');
  if (failed.length) {
    log(`${failed.length} preflight check(s) failed.`);
    process.exit(1);
  }
  log('Ready.');
}

async function cmdVerify(): Promise<void> {
  log('End-to-end verification');
  const report = await verifyEndToEnd(log);
  if (!report.ok) process.exit(1);
}

/**
 * The version last ingested, read from the database rather than the local
 * manifest: a CI runner starts from a fresh checkout every week, so the
 * run ledger — not the workspace — is the source of truth for what the
 * database has already absorbed.
 */
async function lastIngestedVersion(): Promise<string | null> {
  const { data } = await admin()
    .from('ingestion_runs')
    .select('summary')
    .eq('job_key', 'transfermarkt_dataset_update')
    .in('status', ['SUCCESS', 'PARTIAL'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data?.summary as Record<string, unknown> | null)?.datasetVersion;
  return typeof v === 'string' && v ? v : null;
}

async function cmdUpdate(): Promise<void> {
  await cmdPreflight();
  log('');
  const status = await checkForUpdate();
  const ingested = (await lastIngestedVersion()) ?? status.localVersion;
  log(`Published ${status.remoteVersion}; last ingested ${ingested ?? 'never'}`);
  if (ingested === status.remoteVersion && !flag('force')) {
    log('Already current. Pass --force to re-import anyway.');
    return;
  }
  await cmdDownload();
  log('');
  await cmdImport();
  log('');
  await cmdResolve();
  log('');
  await cmdSignals();
}

async function cmdHourly(): Promise<void> {
  log('Hourly intelligence — portfolio and priority players');
  const result = await runHourlyIntelligence({
    force: flag('force'),
    maxPlayers: option('max-players') ?? 60,
    log,
  });
  log('');
  log(
    `Checked ${result.checked}, skipped ${result.skipped} inside their interval, ` +
      `${result.updated} updated, ${result.news} new items.`,
  );
}

const COMMANDS: Record<string, () => Promise<void>> = {
  hourly: cmdHourly,
  download: cmdDownload,
  import: cmdImport,
  update: cmdUpdate,
  resolve: cmdResolve,
  recover: cmdRecover,
  signals: cmdSignals,
  quality: cmdQuality,
  status: cmdStatus,
  preflight: cmdPreflight,
  verify: cmdVerify,
};

const command = process.argv[2];
const handler = command ? COMMANDS[command] : undefined;

if (!handler) {
  console.error(`Unknown command '${command ?? ''}'. Available: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

handler().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
