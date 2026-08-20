/**
 * TRANSFERMARKT DATASET — SEASON STATISTICS
 * ---------------------------------------------------------------------------
 * Aggregates the dataset's `appearances` table (one row per player per game:
 * minutes, goals, assists, cards) into per-player, per-season, per-competition
 * counting statistics for `player_season_stats`.
 *
 * Honesty rules, both load-bearing:
 *
 *   1. Only metrics the source genuinely carries are written: matches,
 *      minutes, goals, assists, cards. xG, duels, progressive actions and the
 *      rest stay NULL until a licensed provider supplies them. Nothing is
 *      derived or imputed.
 *
 *   2. Nothing is fabricated for data the reference cannot place. A cell in a
 *      competition the reference data does not describe is skipped and counted
 *      in the run summary (a season-less row could not be kept idempotent);
 *      a cell whose club is unknown keeps its season and competition and is
 *      stored with NULL club. The natural key is NULLS NOT DISTINCT
 *      (migration 20260820120000), so NULL-club rows update in place on
 *      re-import instead of duplicating.
 *
 * The season label follows the dataset's own convention: `games.season` is
 * the starting year of the European season, so 2024 becomes '2024/2025' —
 * matching the schema's documented format.
 */
import { findTable, int, readRows, str, type Row } from '../csv.js';
import { paths } from '../env.js';
import { admin, selectAll, upsertChunked } from '../supabase.js';
import type { IngestionRun } from '../run.js';

const PROVIDER = 'TRANSFERMARKT_DATASET';

type Log = (m: string) => void;

/** What one game contributes to the aggregation key. */
export interface GameMeta {
  season: number;
  competitionTm: string | null;
}

/** One aggregated (player, season, competition, club) cell. */
export interface SeasonAggregate {
  playerTm: string;
  season: number;
  competitionTm: string | null;
  clubTm: string | null;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
}

export interface AggregationOutcome {
  aggregates: SeasonAggregate[];
  scanned: number;
  kept: number;
  unknownGame: number;
}

/** '2024' → '2024/2025', the schema's documented season-name format. */
export function seasonName(startYear: number): string {
  return `${startYear}/${startYear + 1}`;
}

/**
 * Pure aggregation core, separated from IO so the arithmetic is unit-testable.
 * Accepts any iterable of appearance rows; the caller streams the real file.
 */
export async function aggregateAppearances(
  rows: AsyncIterable<Row> | Iterable<Row>,
  games: Map<string, GameMeta>,
  isTrackedPlayer: (tmId: string) => boolean,
): Promise<AggregationOutcome> {
  const cells = new Map<string, SeasonAggregate>();
  let scanned = 0;
  let kept = 0;
  let unknownGame = 0;

  for await (const r of rows as AsyncIterable<Row>) {
    scanned += 1;
    const playerTm = str(r.player_id);
    if (!playerTm || !isTrackedPlayer(playerTm)) continue;

    const gameId = str(r.game_id);
    const game = gameId ? games.get(gameId) : undefined;
    if (!game) {
      unknownGame += 1;
      continue;
    }

    kept += 1;
    const clubTm = str(r.player_club_id);
    const key = `${playerTm}|${game.season}|${game.competitionTm ?? ''}|${clubTm ?? ''}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        playerTm,
        season: game.season,
        competitionTm: game.competitionTm,
        clubTm,
        matches: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellows: 0,
        reds: 0,
      };
      cells.set(key, cell);
    }

    cell.matches += 1;
    cell.minutes += int(r.minutes_played) ?? 0;
    cell.goals += int(r.goals) ?? 0;
    cell.assists += int(r.assists) ?? 0;
    cell.yellows += int(r.yellow_cards) ?? 0;
    cell.reds += int(r.red_cards) ?? 0;
  }

  return { aggregates: [...cells.values()], scanned, kept, unknownGame };
}

/** Streams `games` into the minimal per-game metadata the aggregation needs. */
async function loadGameMeta(): Promise<Map<string, GameMeta>> {
  const file = findTable(paths.transfermarkt(), 'games') ?? findTable(paths.data(), 'games');
  if (!file) {
    throw new Error(
      "Transfermarkt table 'games' not found.\n" +
        "Run 'pnpm data:download' first — season statistics need games and appearances.",
    );
  }
  const map = new Map<string, GameMeta>();
  for await (const r of readRows(file)) {
    const id = str(r.game_id);
    const season = int(r.season);
    if (!id || season === null) continue;
    map.set(id, { season, competitionTm: str(r.competition_id) });
  }
  return map;
}

/**
 * Ensures a `seasons` row exists for every (competition, season name) pair the
 * aggregates reference, returning `${competitionUuid}|${name}` → season UUID.
 * Competitions the reference data does not know produce no season row — the
 * stat row then carries NULL season_id, which the natural key tolerates.
 */
async function ensureSeasons(
  wanted: Map<string, { competitionId: string; name: string }>,
  run: IngestionRun,
): Promise<Map<string, string>> {
  const existing = await selectAll<{ id: string; competition_id: string; name: string }>(
    'seasons',
    'id, competition_id, name',
  );
  const byKey = new Map(existing.map((s) => [`${s.competition_id}|${s.name}`, s.id]));

  const missing = [...wanted.values()].filter((w) => !byKey.has(`${w.competitionId}|${w.name}`));
  if (missing.length) {
    const { data, error } = await admin()
      .from('seasons')
      .upsert(
        missing.map((w) => ({ competition_id: w.competitionId, name: w.name })),
        { onConflict: 'competition_id,name', ignoreDuplicates: false },
      )
      .select('id, competition_id, name');
    if (error) throw new Error(`seasons: write failed — ${error.message}`);
    for (const s of data ?? []) byKey.set(`${s.competition_id}|${s.name}`, s.id);
    run.count({ created: missing.length });
  }
  return byKey;
}

export interface StatsResult {
  rows: number;
  players: number;
  unknownGame: number;
  unresolvedCompetition: number;
  unresolvedClub: number;
}

/**
 * Full import step: stream, aggregate, resolve dimensions, upsert.
 *
 * Memory note: the aggregate map is bounded by tracked players × their career
 * (season, competition, club) cells — roughly 15–20 cells per player, so a
 * full-database import stays in the low hundreds of MB and a staged one is
 * negligible. The appearances file itself is never held in memory.
 */
export async function importSeasonStats(
  run: IngestionRun,
  playerIds: Map<string, string>,
  clubIds: Map<string, string>,
  competitionIds: Map<string, string>,
  log: Log,
): Promise<StatsResult> {
  const appearances =
    findTable(paths.transfermarkt(), 'appearances') ?? findTable(paths.data(), 'appearances');
  if (!appearances) {
    throw new Error(
      "Transfermarkt table 'appearances' not found.\n" +
        "Run 'pnpm data:download' first — season statistics need games and appearances.",
    );
  }

  log('  season stats     streaming games …');
  const games = await loadGameMeta();
  log(`  season stats     ${games.size} games indexed; streaming appearances …`);

  const outcome = await aggregateAppearances(readRows(appearances), games, (tm) =>
    playerIds.has(tm),
  );
  run.count({ fetched: outcome.scanned });

  // Season rows only exist for competitions the reference data resolves.
  const wantedSeasons = new Map<string, { competitionId: string; name: string }>();
  for (const a of outcome.aggregates) {
    const competitionId = a.competitionTm ? competitionIds.get(a.competitionTm) : undefined;
    if (!competitionId) continue;
    const name = seasonName(a.season);
    wantedSeasons.set(`${competitionId}|${name}`, { competitionId, name });
  }
  const seasonIds = await ensureSeasons(wantedSeasons, run);

  const now = new Date().toISOString();
  let unresolvedCompetition = 0;
  let unresolvedClub = 0;
  const players = new Set<string>();

  // Cells are re-keyed by their RESOLVED dimensions before writing, because
  // the database's natural key is on resolved ids and a single upsert batch
  // may not touch one row twice — the first rehearsal run failed on exactly
  // that when two unresolved dimensions collapsed onto the same NULL.
  //
  // A cell whose COMPETITION cannot be resolved is skipped and counted, not
  // stored: without a competition there is no season row, and a season-less
  // NULL row cannot keep two different years apart under the natural key.
  // (Measured against the 2026-08-05 release this drops ~0.9% of appearance
  // rows — four cup codes absent from competitions.csv.) A cell whose CLUB
  // cannot be resolved keeps its season and competition and is stored with
  // NULL club — a well-defined "clubs the reference data does not describe"
  // bucket, merged per season.
  const merged = new Map<string, Record<string, unknown>>();
  for (const a of outcome.aggregates) {
    const competitionId = a.competitionTm ? competitionIds.get(a.competitionTm) : undefined;
    if (!competitionId) {
      unresolvedCompetition += 1;
      continue;
    }
    const seasonId = seasonIds.get(`${competitionId}|${seasonName(a.season)}`);
    if (!seasonId) {
      // ensureSeasons created every (competition, season) pair above; a miss
      // here is a programming error, not a data condition.
      throw new Error(`season row missing for competition ${competitionId} ${seasonName(a.season)}`);
    }

    const playerId = playerIds.get(a.playerTm)!;
    players.add(playerId);
    const clubId = a.clubTm ? (clubIds.get(a.clubTm) ?? null) : null;
    if (a.clubTm && !clubId) unresolvedClub += 1;

    const key = `${playerId}|${seasonId}|${competitionId}|${clubId ?? ''}`;
    const existing = merged.get(key);
    if (existing) {
      existing.matches_played = (existing.matches_played as number) + a.matches;
      existing.minutes_played = (existing.minutes_played as number) + a.minutes;
      existing.goals = (existing.goals as number) + a.goals;
      existing.assists = (existing.assists as number) + a.assists;
      existing.yellow_cards = (existing.yellow_cards as number) + a.yellows;
      existing.red_cards = (existing.red_cards as number) + a.reds;
      continue;
    }
    merged.set(key, {
      player_id: playerId,
      season_id: seasonId,
      competition_id: competitionId,
      club_id: clubId,
      provider_code: PROVIDER,
      matches_played: a.matches,
      minutes_played: a.minutes,
      goals: a.goals,
      assists: a.assists,
      yellow_cards: a.yellows,
      red_cards: a.reds,
      retrieved_at: now,
      updated_at: now,
    });
  }
  const rows = [...merged.values()];

  const written = await upsertChunked('player_season_stats', rows, {
    onConflict: 'player_id,season_id,competition_id,club_id,provider_code',
    label: 'player_season_stats',
  });

  run.count({ created: written });
  run.note('seasonStats', {
    rows: written,
    players: players.size,
    appearancesScanned: outcome.scanned,
    appearancesKept: outcome.kept,
    unknownGame: outcome.unknownGame,
    unresolvedCompetition,
    unresolvedClub,
  });
  log(
    `  season stats     ${written} rows for ${players.size} players ` +
      `(${outcome.kept} appearances; ${outcome.unknownGame} unknown game, ` +
      `${unresolvedCompetition} unresolved competition, ${unresolvedClub} unresolved club)`,
  );

  return {
    rows: written,
    players: players.size,
    unknownGame: outcome.unknownGame,
    unresolvedCompetition,
    unresolvedClub,
  };
}
