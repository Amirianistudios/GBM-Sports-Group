/**
 * MERGE RECOVERY — targeted re-ingestion for the survivors of the defective merge
 * ---------------------------------------------------------------------------
 * `gbm_merge_player` ran 46 times before migration 0045 fixed it, and on any
 * unique-key collision it deleted the duplicate's rows instead of keeping
 * them. It kept no audit, so what it destroyed cannot be listed — only
 * inferred from the cohort fingerprint (market values and transfers depleted,
 * contracts and representation intact). This module closes the part of that
 * gap that CAN be closed: it re-imports, from the Transfermarkt dataset, every
 * row the source still holds for each survivor, through exactly the same
 * idempotent upsert paths the weekly import uses. Re-running it is safe by
 * construction; it can update rows but never duplicate them, and it never
 * creates a player.
 *
 * What it deliberately does not do:
 *
 *   - It does not touch players without a Transfermarkt identity. Nine of the
 *     46 came through the Avengers/Grok path and have no dataset to re-read.
 *     They are classified, not silently skipped.
 *   - It does not claim completeness. A survivor is RECOVERED when GBM holds
 *     at least as many market values and transfers as the dataset itself
 *     carries for that id — source-complete, not history-complete. Rows the
 *     old function destroyed that the dataset no longer carries are gone, and
 *     the docs say so.
 *
 * Classification (persisted per attempt in `merge_recovery_attempts`, and
 * surfaced by `v_merge_recovery_queue.recovery_state`; PENDING is the state
 * of a survivor with no attempt yet):
 *
 *   RECOVERED            source-complete for market values and transfers
 *   PARTIAL              the import added rows but the dataset still holds more
 *   NO_SOURCE_AVAILABLE  no Transfermarkt id and no raw payloads to re-read
 *   MANUAL_REVIEW        an automated path cannot decide: either the player
 *                        has only raw payloads (a human can re-process them),
 *                        or the dataset does not know their Transfermarkt id
 */
import { CORE_TABLES, STATS_TABLES, download } from '../dataset.js';
import { date, findTable, num, readRows, str, type Row } from '../csv.js';
import { paths } from '../env.js';
import { admin, selectAll } from '../supabase.js';
import { importContracts, importRepresentation, importTransfers, importValuations } from './import.js';
import { importSeasonStats } from './stats.js';
import type { IngestionRun } from '../run.js';

type Log = (m: string) => void;

/** What a survivor holds in each table the defect could touch. */
export interface Coverage {
  season_stats: number;
  market_values: number;
  transfers: number;
  contracts: number;
  representation: number;
}

/**
 * What the Transfermarkt dataset holds for one player id — counted with the
 * same row filters the importer applies, so "recovered" compares like with
 * like. Appearances are not counted here: season statistics are aggregates,
 * so a row-level comparison is not meaningful, and the cohort fingerprint
 * localised the loss to market values and transfers anyway.
 */
export interface SourceAvailability {
  marketValues: number;
  transfers: number;
  inPlayersTable: boolean;
}

export type RecoveryState = 'RECOVERED' | 'PARTIAL' | 'NO_SOURCE_AVAILABLE' | 'MANUAL_REVIEW';

export const RECOVERY_STATES: readonly RecoveryState[] = [
  'RECOVERED',
  'PARTIAL',
  'NO_SOURCE_AVAILABLE',
  'MANUAL_REVIEW',
];

/**
 * Decides one survivor's state after an attempt. Pure so the truth table is
 * unit-testable; the boundaries here are the contract MERGE_RECOVERY.md
 * documents.
 */
export function classifyRecovery(input: {
  tmId: string | null;
  rawPayloads: number;
  availability: SourceAvailability | null;
  after: Coverage;
}): RecoveryState {
  if (!input.tmId) {
    // No Transfermarkt identity: the dataset cannot help. Raw payloads in
    // source_records are a lead a human can follow; nothing at all is a
    // documented dead end, not a queue entry that pretends to be actionable.
    return input.rawPayloads > 0 ? 'MANUAL_REVIEW' : 'NO_SOURCE_AVAILABLE';
  }

  const a = input.availability;
  if (!a || (!a.inPlayersTable && a.marketValues === 0 && a.transfers === 0)) {
    // The dataset does not know this id — a youth or regional player below
    // its coverage floor. The source exists but holds nothing to re-read.
    return 'MANUAL_REVIEW';
  }

  // Source-complete: GBM holds at least what the dataset does. ">=" because
  // other providers may contribute rows the dataset never had.
  return input.after.market_values >= a.marketValues && input.after.transfers >= a.transfers
    ? 'RECOVERED'
    : 'PARTIAL';
}

interface QueueRow extends Coverage {
  player_id: string;
  full_name: string;
  raw_payloads: number;
  likely_lost_rows: boolean;
}

interface Target {
  playerId: string;
  fullName: string;
  tmId: string | null;
  rawPayloads: number;
  before: Coverage;
}

const COVERAGE_KEYS: (keyof Coverage)[] = [
  'season_stats',
  'market_values',
  'transfers',
  'contracts',
  'representation',
];

function coverageOf(row: QueueRow): Coverage {
  const c = {} as Coverage;
  for (const k of COVERAGE_KEYS) c[k] = Number(row[k] ?? 0);
  return c;
}

async function readQueue(): Promise<QueueRow[]> {
  return selectAll<QueueRow>(
    'v_merge_recovery_queue',
    'player_id, full_name, season_stats, market_values, transfers, contracts, representation, raw_payloads, likely_lost_rows',
  );
}

/**
 * The Transfermarkt id per survivor. The dataset importer writes under
 * TRANSFERMARKT_DATASET; older collection paths wrote TRANSFERMARKT. Both
 * name the same numeric id space, and five survivors hold only the dataset
 * code — which is why this looks at both, preferring the code the importer
 * itself maintains.
 */
async function tmIdsFor(playerIds: string[]): Promise<Map<string, string>> {
  const rows = await selectAll<{ player_id: string; provider_code: string; external_id: string }>(
    'player_external_ids',
    'player_id, provider_code, external_id',
    (q) => q.in('provider_code', ['TRANSFERMARKT_DATASET', 'TRANSFERMARKT']).in('player_id', playerIds),
  );
  const byPlayer = new Map<string, string>();
  // TRANSFERMARKT_DATASET first so it wins when both codes are present.
  for (const code of ['TRANSFERMARKT_DATASET', 'TRANSFERMARKT']) {
    for (const r of rows) {
      if (r.provider_code === code && !byPlayer.has(r.player_id)) {
        byPlayer.set(r.player_id, r.external_id);
      }
    }
  }
  return byPlayer;
}

/** provider-id → GBM UUID for one external-id table, read-only. */
async function idMap(table: string, fk: string): Promise<Map<string, string>> {
  const rows = await selectAll<Record<string, string>>(table, `external_id, ${fk}`, (q) =>
    q.eq('provider_code', 'TRANSFERMARKT_DATASET'),
  );
  return new Map(rows.map((r) => [r.external_id, r[fk]]));
}

function datasetTable(name: string) {
  const found = findTable(paths.transfermarkt(), name) ?? findTable(paths.data(), name);
  if (!found) {
    throw new Error(`Transfermarkt table '${name}' not found after download — cannot recover.`);
  }
  return found;
}

/**
 * One streaming pass per history table, counting what the dataset holds for
 * the targeted ids — using the importer's own keep/skip filters so the
 * comparison is honest. Also captures the players.csv rows the contract and
 * representation steps need.
 */
async function measureAvailability(
  tmIds: Set<string>,
): Promise<{ availability: Map<string, SourceAvailability>; playerRows: Map<string, Row> }> {
  const availability = new Map<string, SourceAvailability>();
  for (const id of tmIds) {
    availability.set(id, { marketValues: 0, transfers: 0, inPlayersTable: false });
  }
  const playerRows = new Map<string, Row>();

  for await (const r of readRows(datasetTable('players'))) {
    const tm = str(r.player_id);
    if (!tm || !tmIds.has(tm)) continue;
    availability.get(tm)!.inPlayersTable = true;
    playerRows.set(tm, r);
  }

  for await (const r of readRows(datasetTable('player_valuations'))) {
    const tm = str(r.player_id);
    if (!tm || !tmIds.has(tm)) continue;
    if (!date(r.date) || num(r.market_value_in_eur) === null) continue;
    availability.get(tm)!.marketValues += 1;
  }

  // The importer collapses exact duplicate transfer rows; count the same way.
  const seen = new Set<string>();
  for await (const r of readRows(datasetTable('transfers'))) {
    const tm = str(r.player_id);
    if (!tm || !tmIds.has(tm)) continue;
    const when = date(r.transfer_date);
    if (!when) continue;
    const key = `${tm}|${when}|${str(r.from_club_id) ?? ''}|${str(r.to_club_id) ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    availability.get(tm)!.transfers += 1;
  }

  return { availability, playerRows };
}

export interface RecoveryResult {
  attempted: number;
  recoverable: number;
  states: Record<RecoveryState, number>;
  stillFlagged: number;
}

export async function recoverMergedPlayers(run: IngestionRun, log: Log): Promise<RecoveryResult> {
  // 1. The cohort, and what each survivor holds right now. Captured before
  //    any write so the attempt records a true before/after.
  const queueBefore = await readQueue();
  if (queueBefore.length === 0) {
    log('  nothing to recover — the queue is empty.');
    run.note('recovery', { attempted: 0 });
    return {
      attempted: 0,
      recoverable: 0,
      states: { RECOVERED: 0, PARTIAL: 0, NO_SOURCE_AVAILABLE: 0, MANUAL_REVIEW: 0 },
      stillFlagged: 0,
    };
  }

  const tmByPlayer = await tmIdsFor(queueBefore.map((r) => r.player_id));
  const targets: Target[] = queueBefore.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    tmId: tmByPlayer.get(r.player_id) ?? null,
    rawPayloads: Number(r.raw_payloads ?? 0),
    before: coverageOf(r),
  }));
  const anchored = targets.filter((t) => t.tmId !== null);
  log(`  survivors        ${targets.length} (${anchored.length} with a Transfermarkt id)`);
  run.count({ fetched: targets.length });

  // 2. The dataset. `download` revalidates with HEAD and skips files that
  //    already match the published size, so a warm workspace costs nothing.
  log('  dataset          checking …');
  const manifest = await download([...CORE_TABLES, ...STATS_TABLES], (m) => log(`  ${m.trim()}`));
  run.note('datasetVersion', manifest.datasetVersion);

  // 3. What the source holds for each anchored survivor — measured before
  //    importing so RECOVERED/PARTIAL is a comparison, not a guess.
  const tmIdSet = new Set(anchored.map((t) => t.tmId!));
  log('  availability     measuring what the dataset holds …');
  const { availability, playerRows } = await measureAvailability(tmIdSet);

  // 4. Targeted re-import through the standard idempotent paths. The player
  //    map holds ONLY the survivors, so the streaming importers write rows
  //    for them alone. Clubs and competitions are read-only lookups: every
  //    prior full import has already materialised them, and an unresolvable
  //    club degrades to NULL exactly as the weekly import would.
  const playerIds = new Map(anchored.map((t) => [t.tmId!, t.playerId]));
  const clubIds = await idMap('club_external_ids', 'club_id');
  const competitionIds = await idMap('competition_external_ids', 'competition_id');
  log(`  reference        ${clubIds.size} clubs, ${competitionIds.size} competitions mapped`);

  await importContracts(run, playerIds, clubIds, playerRows, log);
  await importRepresentation(run, playerIds, playerRows, log);
  await importValuations(run, playerIds, clubIds, log);
  await importTransfers(run, playerIds, clubIds, log);
  await importSeasonStats(run, playerIds, clubIds, competitionIds, log);

  // 5. Re-read the queue: the view recomputes, so this is the same measure
  //    the application shows, not a parallel arithmetic that could drift.
  const queueAfter = await readQueue();
  const afterByPlayer = new Map(queueAfter.map((r) => [r.player_id, r]));

  const states: Record<RecoveryState, number> = {
    RECOVERED: 0,
    PARTIAL: 0,
    NO_SOURCE_AVAILABLE: 0,
    MANUAL_REVIEW: 0,
  };
  const attempts: Record<string, unknown>[] = [];
  const perPlayer: Record<string, unknown>[] = [];

  for (const t of targets) {
    const afterRow = afterByPlayer.get(t.playerId);
    const after = afterRow ? coverageOf(afterRow) : t.before;
    const avail = t.tmId ? (availability.get(t.tmId) ?? null) : null;
    const state = classifyRecovery({
      tmId: t.tmId,
      rawPayloads: t.rawPayloads,
      availability: avail,
      after,
    });
    states[state] += 1;

    const delta = {} as Coverage;
    for (const k of COVERAGE_KEYS) delta[k] = after[k] - t.before[k];

    attempts.push({
      run_id: run.id,
      player_id: t.playerId,
      tm_id: t.tmId,
      state,
      before_coverage: t.before,
      after_coverage: after,
      source_availability: avail,
    });
    perPlayer.push({ player: t.fullName, tmId: t.tmId, state, delta });
  }

  const { error } = await admin().from('merge_recovery_attempts').insert(attempts);
  if (error) throw new Error(`merge_recovery_attempts: write failed — ${error.message}`);

  const stillFlagged = queueAfter.filter((r) => r.likely_lost_rows).length;
  run.note('recovery', {
    attempted: targets.length,
    recoverable: anchored.length,
    states,
    stillFlagged,
    perPlayer,
  });

  log('');
  log(
    `  outcome          ${states.RECOVERED} recovered, ${states.PARTIAL} partial, ` +
      `${states.MANUAL_REVIEW} manual review, ${states.NO_SOURCE_AVAILABLE} no source`,
  );
  return { attempted: targets.length, recoverable: anchored.length, states, stillFlagged };
}
