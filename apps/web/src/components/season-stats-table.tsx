import { formatPer90 } from '@/lib/format';

export interface SeasonStatRow {
  id: string;
  season_name: string | null;
  competition_name: string | null;
  club_name: string | null;
  matches_played: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}

const PER90_FLOOR = 270;

function per90(count: number | null, minutes: number | null): number | null {
  if (count == null || minutes == null || minutes < PER90_FLOOR) return null;
  return (count * 90) / minutes;
}

/**
 * Season-by-season counting statistics, newest first. Per-90 rates appear
 * only at 270+ minutes — a rate computed on a cameo is noise wearing a
 * number's clothes. Advanced columns are deliberately absent until a licensed
 * provider supplies them; the caption says so instead of showing dashes that
 * imply "zero".
 */
export function SeasonStatsTable({ rows }: { rows: SeasonStatRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm px-4 py-6" style={{ color: 'var(--muted)' }}>
        No season statistics from connected sources. Statistics arrive with the competition coverage
        of the connected dataset — a player outside those competitions shows none, which is a
        coverage fact, not a zero.
      </p>
    );
  }

  return (
    <div className="scroll-x">
      <table className="w-full text-sm" style={{ minWidth: '640px' }}>
        <thead>
          <tr className="text-left" style={{ borderBottom: '1px solid var(--border)' }}>
            <th className="eyebrow font-semibold px-4 py-2">Season</th>
            <th className="eyebrow font-semibold px-2 py-2">Competition</th>
            <th className="eyebrow font-semibold px-2 py-2">Club</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">Apps</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">Min</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">G</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">A</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">G/90</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right">A/90</th>
            <th className="eyebrow font-semibold px-2 py-2 text-right pr-4">Cards</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="data px-4 py-2 whitespace-nowrap">{r.season_name ?? '—'}</td>
              <td className="px-2 py-2 max-w-[12rem] truncate">{r.competition_name ?? 'Unresolved competition'}</td>
              <td className="px-2 py-2 max-w-[11rem] truncate" style={{ color: 'var(--muted)' }}>
                {r.club_name ?? '—'}
              </td>
              <td className="data px-2 py-2 text-right">{r.matches_played ?? '—'}</td>
              <td className="data px-2 py-2 text-right">
                {r.minutes_played != null ? r.minutes_played.toLocaleString('en-GB') : '—'}
              </td>
              <td className="data px-2 py-2 text-right font-semibold">{r.goals ?? '—'}</td>
              <td className="data px-2 py-2 text-right">{r.assists ?? '—'}</td>
              <td className="data px-2 py-2 text-right" style={{ color: 'var(--muted)' }}>
                {formatPer90(per90(r.goals, r.minutes_played))}
              </td>
              <td className="data px-2 py-2 text-right" style={{ color: 'var(--muted)' }}>
                {formatPer90(per90(r.assists, r.minutes_played))}
              </td>
              <td className="data px-2 py-2 text-right pr-4" style={{ color: 'var(--muted)' }}>
                {(r.yellow_cards ?? 0) > 0 || (r.red_cards ?? 0) > 0
                  ? `${r.yellow_cards ?? 0}Y ${r.red_cards ?? 0}R`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
