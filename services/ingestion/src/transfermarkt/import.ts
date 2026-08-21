/**
 * TRANSFERMARKT DATASET IMPORTER
 * ---------------------------------------------------------------------------
 * Normalises dcaribou/transfermarkt-datasets into the GBM canonical model.
 *
 * Two rules govern the whole file:
 *
 *   1. A Transfermarkt id is NEVER a GBM id. Every entity is reconciled
 *      through its `*_external_ids` row, so re-running the importer updates
 *      the same GBM UUID instead of creating a second copy of the player.
 *
 *   2. The importer stores what the source actually says. A blank agent field
 *      becomes NO_AGENCY_LISTED with a retrieval timestamp — evidence that we
 *      looked and found nothing — never a silent assumption that the player
 *      is unrepresented.
 */
import { randomUUID } from 'node:crypto';

import { collect, date, findTable, int, num, readRows, str, type Row } from '../csv.js';
import { foot, normalizeName, parseFee, tmPlayerUrl } from '../normalize.js';
import { admin, selectAll, upsertChunked } from '../supabase.js';
import { paths } from '../env.js';
import { importSeasonStats } from './stats.js';
import { selectPlayers } from './select.js';
import type { IngestionRun } from '../run.js';

const PROVIDER = 'TRANSFERMARKT_DATASET';
const TM = 'https://www.transfermarkt.com';

type Log = (m: string) => void;

/** An entity that already exists in GBM but is missing this provider's id. */
interface Adoption {
  id: string;
  tmId: string;
  url: string | null;
}

/** Locates the dataset, preferring the downloaded `.csv.gz` set. */
function table(name: string) {
  const found = findTable(paths.transfermarkt(), name) ?? findTable(paths.data(), name);
  if (!found) {
    throw new Error(
      `Transfermarkt table '${name}' not found.\n` +
        `Run 'pnpm data:download' first — it fetches the published dataset into data/transfermarkt/.`,
    );
  }
  return found;
}

export interface ImportOptions {
  /**
   * Cap on players imported, GBM priority order (see select.ts): active
   * players ranked by age, target markets, value band, contract window.
   * Omit for the full dataset.
   */
  maxPlayers?: number;
  /** Only import players whose last recorded season is >= this year. */
  sinceSeason?: number;
  /** Skip the large history tables when only identities are wanted. */
  skipValuations?: boolean;
  skipTransfers?: boolean;
  /** Skip the appearances → season statistics aggregation. */
  skipStats?: boolean;
  log?: Log;
}

export async function importTransfermarkt(run: IngestionRun, opts: ImportOptions = {}) {
  const log = opts.log ?? console.log;

  const countryByName = await importCountries(run, log);
  const competitionIds = await importCompetitions(run, countryByName, log);
  const clubIds = await importClubs(run, competitionIds, log);
  const { playerIds, playerRows } = await importPlayers(run, clubIds, countryByName, opts, log);

  await importContracts(run, playerIds, clubIds, playerRows, log);
  await importRepresentation(run, playerIds, playerRows, log);

  if (!opts.skipValuations) await importValuations(run, playerIds, clubIds, log);
  if (!opts.skipTransfers) await importTransfers(run, playerIds, clubIds, log);
  if (!opts.skipStats) await importSeasonStats(run, playerIds, clubIds, competitionIds, log);

  return { players: playerIds.size, clubs: clubIds.size, competitions: competitionIds.size };
}

// ---------------------------------------------------------------------------
// COUNTRIES — matched by normalised name, since the schema has no country
// external-id table and country names are stable across providers.
// ---------------------------------------------------------------------------
async function importCountries(run: IngestionRun, log: Log): Promise<Map<string, string>> {
  const existing = await selectAll<{ id: string; name: string }>('countries', 'id, name');
  const byNorm = new Map<string, string>();
  for (const c of existing) {
    const n = normalizeName(c.name);
    if (n) byNorm.set(n, c.id);
  }

  const rows = await collect(table('countries'));
  const missing: { name: string; confederation: string | null }[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const name = str(r.country_name);
    const n = normalizeName(name);
    if (!name || !n || byNorm.has(n) || seen.has(n)) continue;
    seen.add(n);
    missing.push({ name, confederation: str(r.confederation) });
  }

  if (missing.length) {
    const { data, error } = await admin().from('countries').insert(missing).select('id, name');
    if (error) throw new Error(`countries: insert failed — ${error.message}`);
    for (const c of data ?? []) {
      const n = normalizeName(c.name as string);
      if (n) byNorm.set(n, c.id as string);
    }
    run.count({ created: missing.length });
  }

  run.count({ fetched: rows.length });
  log(`  countries        ${byNorm.size} known (+${missing.length} new)`);
  return byNorm;
}

// ---------------------------------------------------------------------------
// COMPETITIONS
// ---------------------------------------------------------------------------
async function importCompetitions(
  run: IngestionRun,
  countryByName: Map<string, string>,
  log: Log,
): Promise<Map<string, string>> {
  const map = await externalIdMap('competition_external_ids', 'competition_id');
  const byNaturalKey = await naturalKeyMap('competitions');
  const rows = await collect(table('competitions'));
  run.count({ fetched: rows.length });

  const updates: Record<string, unknown>[] = [];
  const inserts: { tmId: string; row: Record<string, unknown>; url: string | null }[] = [];
  const adopt: Adoption[] = [];

  for (const r of rows) {
    const tmId = str(r.competition_id);
    if (!tmId) continue;
    const countryName = normalizeName(str(r.country_name));
    const areaName = str(r.country_name);
    const name = str(r.name) ?? tmId;
    const payload = {
      name,
      short_name: str(r.competition_code),
      country_id: countryName ? (countryByName.get(countryName) ?? null) : null,
      area_name: areaName,
      tier: tierOf(str(r.type)),
      is_youth: name.toLowerCase().includes('u19'),
      updated_at: new Date().toISOString(),
    };

    const url = str(r.url);
    const normalized = normalizeName(name);
    const key = normalized ? naturalKey('competitions', normalized, areaName) : null;
    const existingId = map.get(tmId) ?? (key ? byNaturalKey.get(key) : undefined);

    if (existingId) {
      updates.push({ id: existingId, ...payload });
      if (!map.has(tmId)) {
        adopt.push({ id: existingId, tmId, url });
        map.set(tmId, existingId);
      }
    } else {
      inserts.push({ tmId, row: payload, url });
    }
  }

  await writeEntities('competitions', 'competition_external_ids', 'competition_id', updates, inserts, map, run, { adopt });
  log(`  competitions     ${map.size} mapped (+${inserts.length} new, ${adopt.length} adopted)`);
  return map;
}

/**
 * Maps the dataset's competition `type` onto the competition_tier enum.
 * Values must exist in the enum — the first rehearsal import died on a
 * 'DOMESTIC_CUP' that the schema never defined, invisible to typecheck
 * because the column type only exists in the database.
 */
function tierOf(type: string | null): string {
  switch ((type ?? '').toLowerCase()) {
    case 'first_tier':
      return 'FIRST_TIER';
    case 'second_tier':
      return 'SECOND_TIER';
    case 'third_tier':
      return 'THIRD_TIER';
    case 'fourth_tier':
      return 'FOURTH_TIER';
    case 'domestic_cup':
    case 'domestic_super_cup':
      return 'CUP';
    case 'international_cup':
      return 'CONTINENTAL';
    case 'international_super_cup':
      return 'CONTINENTAL';
    default:
      return 'UNKNOWN';
  }
}

// ---------------------------------------------------------------------------
// CLUBS
// ---------------------------------------------------------------------------
async function importClubs(
  run: IngestionRun,
  competitionIds: Map<string, string>,
  log: Log,
): Promise<Map<string, string>> {
  const map = await externalIdMap('club_external_ids', 'club_id');
  const byNaturalKey = await naturalKeyMap('clubs');
  const rows = await collect(table('clubs'));
  run.count({ fetched: rows.length });

  const updates: Record<string, unknown>[] = [];
  const inserts: { tmId: string; row: Record<string, unknown>; url: string | null }[] = [];
  const adopt: Adoption[] = [];

  for (const r of rows) {
    const tmId = str(r.club_id);
    if (!tmId) continue;
    const name = str(r.name) ?? tmId;
    const payload = {
      name,
      short_name: str(r.club_code),
      updated_at: new Date().toISOString(),
    };

    const url = str(r.url);
    const normalized = normalizeName(name);
    const existingId = map.get(tmId) ?? (normalized ? byNaturalKey.get(normalized) : undefined);

    if (existingId) {
      updates.push({ id: existingId, ...payload });
      if (!map.has(tmId)) {
        adopt.push({ id: existingId, tmId, url });
        map.set(tmId, existingId);
      }
    } else {
      inserts.push({ tmId, row: payload, url });
    }
  }

  await writeEntities('clubs', 'club_external_ids', 'club_id', updates, inserts, map, run, { adopt });
  log(`  clubs            ${map.size} mapped (+${inserts.length} new, ${adopt.length} adopted)`);
  return map;
}

// ---------------------------------------------------------------------------
// PLAYERS — the canonical identity, plus their Transfermarkt external id.
// ---------------------------------------------------------------------------
async function importPlayers(
  run: IngestionRun,
  clubIds: Map<string, string>,
  countryByName: Map<string, string>,
  opts: ImportOptions,
  log: Log,
): Promise<{ playerIds: Map<string, string>; playerRows: Map<string, Row> }> {
  const map = await externalIdMap('player_external_ids', 'player_id');

  let rows = await collect(table('players'));
  run.count({ fetched: rows.length });

  if (opts.sinceSeason) {
    rows = rows.filter((r) => (int(r.last_season) ?? 0) >= opts.sinceSeason!);
  }
  if (opts.maxPlayers) {
    const compRows = await collect(table('competitions'));
    const competitionCountry = new Map<string, string>();
    for (const c of compRows) {
      const id = str(c.competition_id);
      const country = str(c.country_name);
      if (id && country) competitionCountry.set(id, country);
    }
    rows = selectPlayers(rows, opts.maxPlayers, { competitionCountry, today: new Date() });
  }

  const updates: Record<string, unknown>[] = [];
  const inserts: { tmId: string; row: Record<string, unknown>; url: string | null }[] = [];
  const playerRows = new Map<string, Row>();

  for (const r of rows) {
    const tmId = str(r.player_id);
    if (!tmId) continue;
    playerRows.set(tmId, r);

    const clubTm = str(r.current_club_id);
    const nationality = normalizeName(str(r.country_of_citizenship));
    const birthCountry = normalizeName(str(r.country_of_birth));
    const position = str(r.sub_position) ?? str(r.position);

    const payload: Record<string, unknown> = {
      full_name:
        str(r.name) ?? (`${str(r.first_name) ?? ''} ${str(r.last_name) ?? ''}`.trim() || tmId),
      first_name: str(r.first_name),
      last_name: str(r.last_name),
      date_of_birth: date(r.date_of_birth),
      birth_place: str(r.city_of_birth),
      birth_country_id: birthCountry ? (countryByName.get(birthCountry) ?? null) : null,
      nationality_country_id: nationality ? (countryByName.get(nationality) ?? null) : null,
      height_cm: clampHeight(int(r.height_in_cm)),
      foot: foot(str(r.foot)),
      primary_position: position,
      is_goalkeeper: (str(r.position) ?? '').toLowerCase() === 'goalkeeper',
      current_club_id: clubTm ? (clubIds.get(clubTm) ?? null) : null,
      image_url: str(r.image_url),
      last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existingId = map.get(tmId);
    if (existingId) updates.push({ id: existingId, ...payload });
    else inserts.push({ tmId, row: payload, url: str(r.url) ?? tmPlayerUrl(str(r.player_code), tmId) });
  }

  await writeEntities('players', 'player_external_ids', 'player_id', updates, inserts, map, run, {
    namespace: 'spieler',
    matchMethod: 'EXACT_PROVIDER_MAPPING',
  });

  log(`  players          ${map.size} mapped (+${inserts.length} new, ${updates.length} updated)`);
  return { playerIds: map, playerRows };
}

/** The schema rejects implausible heights; the dataset contains a few zeroes. */
function clampHeight(cm: number | null): number | null {
  return cm !== null && cm >= 120 && cm <= 230 ? cm : null;
}

// ---------------------------------------------------------------------------
// CONTRACTS
// ---------------------------------------------------------------------------
async function importContracts(
  run: IngestionRun,
  playerIds: Map<string, string>,
  clubIds: Map<string, string>,
  playerRows: Map<string, Row>,
  log: Log,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const rows: Record<string, unknown>[] = [];

  for (const [tmId, r] of playerRows) {
    const playerId = playerIds.get(tmId);
    const expires = date(r.contract_expiration_date);
    if (!playerId || !expires) continue;
    const clubTm = str(r.current_club_id);
    rows.push({
      player_id: playerId,
      club_id: clubTm ? (clubIds.get(clubTm) ?? null) : null,
      expires_on: expires,
      status: expires < today ? 'EXPIRED' : 'ACTIVE',
      provider_code: PROVIDER,
      source_url: str(r.url),
      retrieved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const n = await upsertChunked('contracts', rows, {
    onConflict: 'player_id,provider_code,club_id',
    label: 'contracts',
  });
  run.count({ updated: n });
  log(`  contracts        ${n} rows`);
}

// ---------------------------------------------------------------------------
// REPRESENTATION — reconciled rather than upserted.
//
// An agency that changes must retire the previous row instead of overwriting
// it, because that transition ("newly unrepresented") is precisely the signal
// GBM wants to act on. Unchanged rows only have retrieved_at refreshed, which
// is what distinguishes "checked today, still blank" from "never checked".
// ---------------------------------------------------------------------------
async function importRepresentation(
  run: IngestionRun,
  playerIds: Map<string, string>,
  playerRows: Map<string, Row>,
  log: Log,
): Promise<void> {
  const current = await selectAll<{ id: string; player_id: string; agency_name: string | null }>(
    'representation_records',
    'id, player_id, agency_name',
    (q) => q.eq('provider_code', PROVIDER).eq('is_current', true),
  );
  const byPlayer = new Map(current.map((r) => [r.player_id, r]));

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  const retire: string[] = [];
  const touch: string[] = [];

  for (const [tmId, r] of playerRows) {
    const playerId = playerIds.get(tmId);
    if (!playerId) continue;

    const agency = str(r.agent_name);
    const existing = byPlayer.get(playerId);

    if (existing && (existing.agency_name ?? null) === agency) {
      touch.push(existing.id);
      continue;
    }
    if (existing) retire.push(existing.id);

    inserts.push({
      player_id: playerId,
      agency_name: agency,
      status: agency ? 'KNOWN_AGENCY' : 'NO_AGENCY_LISTED',
      provider_code: PROVIDER,
      source_url: str(r.url),
      retrieved_at: now,
      is_current: true,
    });
  }

  for (let i = 0; i < retire.length; i += 500) {
    await admin()
      .from('representation_records')
      .update({ is_current: false })
      .in('id', retire.slice(i, i + 500));
  }
  for (let i = 0; i < touch.length; i += 500) {
    await admin()
      .from('representation_records')
      .update({ retrieved_at: now })
      .in('id', touch.slice(i, i + 500));
  }

  const n = await upsertChunked('representation_records', inserts, { label: 'representation' });
  run.count({ created: n, updated: touch.length });
  run.note('representation', { new: n, changed: retire.length, unchanged: touch.length });
  log(`  representation   ${n} new, ${retire.length} changed, ${touch.length} reconfirmed`);
}

// ---------------------------------------------------------------------------
// MARKET VALUES — streamed: 650k+ rows.
// ---------------------------------------------------------------------------
async function importValuations(
  run: IngestionRun,
  playerIds: Map<string, string>,
  clubIds: Map<string, string>,
  log: Log,
): Promise<void> {
  let batch: Record<string, unknown>[] = [];
  let written = 0;
  let seen = 0;
  const now = new Date().toISOString();

  const flush = async () => {
    if (!batch.length) return;
    written += await upsertChunked('market_values', batch, {
      onConflict: 'player_id,provider_code,valued_on',
      ignoreDuplicates: true,
      label: 'market_values',
    });
    batch = [];
  };

  for await (const r of readRows(table('player_valuations'))) {
    seen += 1;
    const playerId = playerIds.get(str(r.player_id) ?? '');
    const valuedOn = date(r.date);
    const amount = num(r.market_value_in_eur);
    if (!playerId || !valuedOn || amount === null) continue;

    const clubTm = str(r.current_club_id);
    batch.push({
      player_id: playerId,
      value_amount: amount,
      currency: 'EUR',
      valued_on: valuedOn,
      club_id: clubTm ? (clubIds.get(clubTm) ?? null) : null,
      provider_code: PROVIDER,
      retrieved_at: now,
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();

  run.count({ fetched: seen, created: written });
  log(`  market values    ${written} rows written (${seen} scanned)`);
}

// ---------------------------------------------------------------------------
// TRANSFERS — streamed: 175k rows.
// ---------------------------------------------------------------------------
async function importTransfers(
  run: IngestionRun,
  playerIds: Map<string, string>,
  clubIds: Map<string, string>,
  log: Log,
): Promise<void> {
  let batch: Record<string, unknown>[] = [];
  let written = 0;
  let seen = 0;
  const now = new Date().toISOString();
  const dedupe = new Set<string>();

  const flush = async () => {
    if (!batch.length) return;
    written += await upsertChunked('transfers', batch, {
      onConflict: 'player_id,provider_code,transfer_date,from_club_id,to_club_id',
      ignoreDuplicates: true,
      label: 'transfers',
    });
    batch = [];
  };

  for await (const r of readRows(table('transfers'))) {
    seen += 1;
    const playerId = playerIds.get(str(r.player_id) ?? '');
    const when = date(r.transfer_date);
    if (!playerId || !when) continue;

    const fromId = clubIds.get(str(r.from_club_id) ?? '') ?? null;
    const toId = clubIds.get(str(r.to_club_id) ?? '') ?? null;

    // The upstream export contains exact duplicate rows; collapsing them here
    // keeps a single INSERT batch from conflicting with itself.
    const key = `${playerId}|${when}|${fromId}|${toId}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    const fee = parseFee(str(r.transfer_fee));
    batch.push({
      player_id: playerId,
      from_club_id: fromId,
      to_club_id: toId,
      from_club_name_raw: str(r.from_club_name),
      to_club_name_raw: str(r.to_club_name),
      transfer_date: when,
      season_name: str(r.transfer_season),
      transfer_type: fee.type,
      fee_amount: fee.amount,
      fee_currency: 'EUR',
      is_loan: fee.isLoan,
      is_free: fee.isFree,
      market_value_at_transfer: num(r.market_value_in_eur),
      provider_code: PROVIDER,
      retrieved_at: now,
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();

  run.count({ fetched: seen, created: written });
  log(`  transfers        ${written} rows written (${seen} scanned)`);
}

// ---------------------------------------------------------------------------
// Shared reconciliation helpers
// ---------------------------------------------------------------------------

/** Loads provider-id → GBM-UUID for one external-id table. */
async function externalIdMap(tableName: string, fk: string): Promise<Map<string, string>> {
  const rows = await selectAll<Record<string, string>>(
    tableName,
    `external_id, ${fk}`,
    (q) => q.eq('provider_code', PROVIDER),
  );
  return new Map(rows.map((r) => [r.external_id, r[fk]]));
}

/**
 * Loads normalised-name → GBM-UUID for entities that carry a natural key.
 *
 * `clubs.normalized_name` and `competitions(normalized_name, area_name)` are
 * UNIQUE in the schema. Without this fallback the importer would try to insert
 * a club that already exists under a different route — one with no
 * TRANSFERMARKT_DATASET external id — and die on the unique violation partway
 * through a run. Matching on the natural key instead adopts the existing entity
 * and gives it the provider id it was missing.
 *
 * Note this is deliberately NOT done for players: `(normalized_name,
 * date_of_birth)` genuinely collides for distinct footballers, so players are
 * reconciled only through their provider ids.
 */
async function naturalKeyMap(
  entityTable: 'clubs' | 'competitions',
): Promise<Map<string, string>> {
  const columns = entityTable === 'competitions' ? 'id, normalized_name, area_name' : 'id, normalized_name';
  const rows = await selectAll<{ id: string; normalized_name: string | null; area_name?: string | null }>(
    entityTable,
    columns,
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.normalized_name) continue;
    map.set(naturalKey(entityTable, r.normalized_name, r.area_name ?? null), r.id);
  }
  return map;
}

/** Mirrors the unique index definition for each entity. */
function naturalKey(
  entityTable: 'clubs' | 'competitions',
  normalized: string,
  areaName: string | null,
): string {
  return entityTable === 'competitions' ? `${normalized}|${areaName ?? ''}` : normalized;
}

/**
 * Applies updates (by known UUID) and inserts (new entities plus their
 * external-id rows), then extends the caller's map so downstream steps can
 * resolve the ids that were just created.
 *
 * The GBM UUID is generated here rather than by the database default. That is
 * deliberate and load-bearing: pairing an inserted entity with its external id
 * by the position of the row in an INSERT … RETURNING response would make the
 * link depend on PostgREST preserving input order. If it ever did not, a player
 * would silently acquire another player's Transfermarkt id — corruption that
 * looks like valid data and would be almost impossible to trace back. Minting
 * the id client-side removes the ordering question entirely.
 */
async function writeEntities(
  entityTable: string,
  externalTable: string,
  fk: string,
  updates: Record<string, unknown>[],
  inserts: { tmId: string; row: Record<string, unknown>; url: string | null }[],
  map: Map<string, string>,
  run: IngestionRun,
  extra: { namespace?: string; matchMethod?: string; adopt?: Adoption[] } = {},
): Promise<void> {
  // Two source rows can resolve to the same GBM entity through the natural-key
  // fallback. Postgres rejects an ON CONFLICT DO UPDATE that touches one row
  // twice in a single statement, so the last write per id wins here instead.
  const deduped = [...new Map(updates.map((u) => [u.id as string, u])).values()];

  if (deduped.length) {
    await upsertChunked(entityTable, deduped, { onConflict: 'id', label: entityTable });
    run.count({ updated: deduped.length });
  }

  // Entities matched by natural key exist already but lack this provider's id.
  if (extra.adopt?.length) {
    await upsertChunked(
      externalTable,
      extra.adopt.map((a) => ({
        [fk]: a.id,
        provider_code: PROVIDER,
        namespace: extra.namespace ?? null,
        external_id: a.tmId,
        url: a.url,
        confidence: 1.0,
        ...(externalTable === 'player_external_ids'
          ? { match_method: extra.matchMethod ?? 'EXACT_PROVIDER_MAPPING' }
          : {}),
      })),
      { onConflict: 'provider_code,namespace,external_id', ignoreDuplicates: true, label: externalTable },
    );
  }

  // Assign every new entity its id up front, so entity and link always agree.
  const pending = inserts.map((s) => ({ ...s, id: randomUUID() }));

  for (let i = 0; i < pending.length; i += 500) {
    const slice = pending.slice(i, i + 500);

    await upsertChunked(
      entityTable,
      slice.map((s) => ({ id: s.id, ...s.row })),
      { onConflict: 'id', ignoreDuplicates: true, label: entityTable },
    );

    const links = slice.map((s) => ({
      [fk]: s.id,
      provider_code: PROVIDER,
      namespace: extra.namespace ?? null,
      external_id: s.tmId,
      url: s.url,
      confidence: 1.0,
      ...(externalTable === 'player_external_ids'
        ? { match_method: extra.matchMethod ?? 'EXACT_PROVIDER_MAPPING' }
        : {}),
    }));

    await upsertChunked(externalTable, links, {
      onConflict: 'provider_code,namespace,external_id',
      ignoreDuplicates: true,
      label: externalTable,
    });

    // Only publish ids once both the entity and its link are durable, so a
    // crash between the two writes cannot leave later steps referencing a
    // player that has no external id.
    for (const s of slice) map.set(s.tmId, s.id);
    run.count({ created: slice.length });
  }
}

export { PROVIDER as TRANSFERMARKT_DATASET_PROVIDER, TM as TRANSFERMARKT_BASE };
