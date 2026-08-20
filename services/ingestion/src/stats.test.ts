import { describe, expect, it } from 'vitest';
import { aggregateAppearances, seasonName, type GameMeta } from './transfermarkt/stats.js';
import type { Row } from './csv.js';

const GAMES = new Map<string, GameMeta>([
  ['g1', { season: 2024, competitionTm: 'GB1' }],
  ['g2', { season: 2024, competitionTm: 'GB1' }],
  ['g3', { season: 2023, competitionTm: 'GB1' }],
  ['g4', { season: 2024, competitionTm: 'CL' }],
]);

function appearance(over: Partial<Record<string, string>>): Row {
  return {
    player_id: '100',
    game_id: 'g1',
    player_club_id: '11',
    minutes_played: '90',
    goals: '0',
    assists: '0',
    yellow_cards: '0',
    red_cards: '0',
    ...over,
  } as Row;
}

describe('seasonName', () => {
  it("follows the schema's documented '2024/2025' format", () => {
    expect(seasonName(2024)).toBe('2024/2025');
    expect(seasonName(1999)).toBe('1999/2000');
  });
});

describe('aggregateAppearances', () => {
  it('aggregates one cell per player/season/competition/club', async () => {
    const rows = [
      appearance({ game_id: 'g1', goals: '2', assists: '1', minutes_played: '90' }),
      appearance({ game_id: 'g2', goals: '1', yellow_cards: '1', minutes_played: '85' }),
      appearance({ game_id: 'g3', minutes_played: '10' }), // different season → own cell
      appearance({ game_id: 'g4', minutes_played: '45' }), // different competition → own cell
    ];
    const out = await aggregateAppearances(rows, GAMES, () => true);

    expect(out.scanned).toBe(4);
    expect(out.kept).toBe(4);
    expect(out.aggregates).toHaveLength(3);

    const main = out.aggregates.find((a) => a.season === 2024 && a.competitionTm === 'GB1')!;
    expect(main.matches).toBe(2);
    expect(main.minutes).toBe(175);
    expect(main.goals).toBe(3);
    expect(main.assists).toBe(1);
    expect(main.yellows).toBe(1);
    expect(main.reds).toBe(0);
  });

  it('drops rows for untracked players and counts unknown games', async () => {
    const rows = [
      appearance({ player_id: '999' }), // untracked
      appearance({ game_id: 'nope' }), // unknown game
      appearance({}),
    ];
    const out = await aggregateAppearances(rows, GAMES, (tm) => tm === '100');
    expect(out.scanned).toBe(3);
    expect(out.kept).toBe(1);
    expect(out.unknownGame).toBe(1);
    expect(out.aggregates).toHaveLength(1);
  });

  it("treats the dataset's blank markers as zero, not NaN", async () => {
    const rows = [appearance({ goals: '', assists: 'NA', minutes_played: 'null' })];
    const out = await aggregateAppearances(rows, GAMES, () => true);
    const cell = out.aggregates[0];
    expect(cell.goals).toBe(0);
    expect(cell.assists).toBe(0);
    expect(cell.minutes).toBe(0);
  });

  it('separates loan spells: same player and season, different clubs', async () => {
    const rows = [
      appearance({ player_club_id: '11' }),
      appearance({ game_id: 'g2', player_club_id: '22' }),
    ];
    const out = await aggregateAppearances(rows, GAMES, () => true);
    expect(out.aggregates).toHaveLength(2);
    expect(out.aggregates.map((a) => a.clubTm).sort()).toEqual(['11', '22']);
  });
});
