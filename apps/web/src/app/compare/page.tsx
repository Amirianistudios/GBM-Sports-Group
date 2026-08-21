import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ComparePicker } from '@/components/compare-picker';
import { formatAge, formatCurrency, positionCode } from '@/lib/format';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | undefined>>;

interface DiscoveryRow {
  player_id: string;
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  primary_position: string | null;
  nationality: string | null;
  club_name: string | null;
  market_value: number | null;
  season_name: string | null;
  season_apps: number | null;
  season_minutes: number | null;
  season_goals: number | null;
  season_assists: number | null;
  goals_per90: number | null;
  assists_per90: number | null;
  image_url: string | null;
}

interface CohortRow {
  season_minutes: number | null;
  season_goals: number | null;
  season_assists: number | null;
  goals_per90: number | null;
  assists_per90: number | null;
  market_value: number | null;
}

type MetricKey = keyof CohortRow;

const METRICS: Array<{ key: MetricKey; label: string; format: (v: number) => string }> = [
  { key: 'season_minutes', label: 'Minutes', format: (v) => `${v.toLocaleString('en-GB')}′` },
  { key: 'season_goals', label: 'Goals', format: (v) => String(v) },
  { key: 'season_assists', label: 'Assists', format: (v) => String(v) },
  { key: 'goals_per90', label: 'Goals /90', format: (v) => v.toFixed(2) },
  { key: 'assists_per90', label: 'Assists /90', format: (v) => v.toFixed(2) },
  { key: 'market_value', label: 'Market value', format: (v) => formatCurrency(v) },
];

const PER90_FLOOR = 270;

/** Share of the cohort at or below the value — 0–100. */
function percentile(cohort: number[], value: number): number {
  if (cohort.length === 0) return 0;
  const below = cohort.filter((c) => c <= value).length;
  return Math.round((below / cohort.length) * 100);
}

/**
 * PLAYER COMPARISON — 2 to 4 players side by side.
 *
 * Percentiles are computed within each player's POSITION cohort among the
 * currently imported players with ≥270 current-season minutes, and the label
 * says exactly that. Identity is carried by column position and name, never
 * by colour — colour in this product is reserved for provenance meaning.
 */
export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ids = (sp.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const supabase = await createClient();

  const { data: rows, error: rowsError } = ids.length
    ? await supabase.from('v_player_discovery').select('*').in('player_id', ids)
    : { data: [] as DiscoveryRow[], error: null };
  if (rowsError) {
    // A silently-empty comparison is indistinguishable from bad ids;
    // the failure must at least reach the runtime logs.
    console.error(`[compare] player lookup failed — ${rowsError.code ?? ''} ${rowsError.message}`);
  }

  // Preserve the URL's order — it is the reading order.
  const players = ids
    .map((pid) => (rows ?? []).find((r) => r.player_id === pid))
    .filter(Boolean) as DiscoveryRow[];

  // One cohort query per distinct position among the compared players.
  const positions = Array.from(new Set(players.map((p) => p.primary_position).filter(Boolean))) as string[];
  const cohortByPosition = new Map<string, CohortRow[]>();
  await Promise.all(
    positions.map(async (pos) => {
      const { data } = await supabase
        .from('v_player_discovery')
        .select('season_minutes, season_goals, season_assists, goals_per90, assists_per90, market_value')
        .eq('primary_position', pos)
        .gte('season_minutes', PER90_FLOOR);
      cohortByPosition.set(pos, (data ?? []) as CohortRow[]);
    }),
  );

  const season = players.find((p) => p.season_name)?.season_name ?? 'current season';

  return (
    <AppShell eyebrow="Research" title="Compare">
      <ComparePicker
        selected={ids.map((pid) => ({
          id: pid,
          name: players.find((p) => p.player_id === pid)?.full_name ?? 'Unknown player',
        }))}
      />

      {players.length < 2 ? (
        <div className="surface mx-4 md:mx-6 mt-3 px-4 py-12 text-center">
          <p className="font-semibold text-sm">Pick two to four players</p>
          <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
            Search above, or open any player profile and tap Compare. Percentiles are computed
            within each player&#8217;s position among imported players with {PER90_FLOOR}+ minutes.
          </p>
        </div>
      ) : (
        <>
          {/* Identity header — this row IS the legend. */}
          <div className="mx-4 md:mx-6 mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => (
              <Link key={p.player_id} href={`/players/${p.player_id}`} className="surface p-3 block min-w-0">
                <p className="font-semibold text-sm leading-tight truncate">{p.full_name}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
                  <span className="pos-chip">
                    {positionCode(p.primary_position)}
                    <span aria-hidden="true">·</span>
                    <span className="data">{formatAge(p.date_of_birth)}</span>
                  </span>
                </div>
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>{p.club_name ?? '—'}</p>
                <p className="data text-sm font-semibold mt-1.5">{formatCurrency(p.market_value)}</p>
              </Link>
            ))}
          </div>

          {/* Metric grid — monochrome percentile bars, values direct-labelled. */}
          <div className="surface mx-4 md:mx-6 mt-3 overflow-hidden">
            <div className="px-4 py-2.5 flex items-baseline justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="eyebrow">{season} · counting statistics</p>
              <p className="eyebrow">bar = percentile in position</p>
            </div>

            {METRICS.map((metric) => (
              <div key={metric.key} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold mb-2">{metric.label}</p>
                <div className="space-y-1.5">
                  {players.map((p) => {
                    const raw = p[metric.key as keyof DiscoveryRow] as number | null;
                    const pos = p.primary_position;
                    const cohortValues = pos
                      ? (cohortByPosition.get(pos) ?? [])
                          .map((c) => c[metric.key])
                          .filter((v): v is number => v != null)
                          .map(Number)
                      : [];
                    const pct = raw != null ? percentile(cohortValues, Number(raw)) : null;
                    const isPer90Gap =
                      raw == null &&
                      (metric.key === 'goals_per90' || metric.key === 'assists_per90') &&
                      (p.season_minutes ?? 0) < PER90_FLOOR;
                    return (
                      <div key={p.player_id} className="flex items-center gap-2">
                        <span className="data text-[0.6875rem] w-14 shrink-0 truncate" style={{ color: 'var(--muted)' }}>
                          {shortName(p.full_name)}
                        </span>
                        <div
                          className="flex-1 h-3 rounded-[2px] relative"
                          style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)' }}
                          title={
                            raw != null
                              ? `${p.full_name}: ${metric.format(Number(raw))} — ${pct}th percentile among ${positionCode(p.primary_position)}s with ${PER90_FLOOR}+ minutes`
                              : `${p.full_name}: no value`
                          }
                        >
                          {raw != null && (
                            <div
                              className="h-full rounded-[2px]"
                              style={{
                                width: `${Math.max(pct ?? 0, 2)}%`,
                                background: 'color-mix(in srgb, var(--fg) 55%, transparent)',
                              }}
                            />
                          )}
                        </div>
                        <span className="data text-xs w-16 text-right shrink-0 font-semibold">
                          {raw != null ? metric.format(Number(raw)) : isPer90Gap ? `<${PER90_FLOOR}′` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <p className="px-4 py-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Percentiles are computed within each player&#8217;s position among the currently imported
              players with {PER90_FLOOR}+ minutes this season — they describe this database, not
              world football. Advanced metrics join the comparison when a licensed provider is
              connected.
            </p>
          </div>
        </>
      )}
      <div className="h-8" />
    </AppShell>
  );
}

function shortName(full: string): string {
  const parts = full.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : full;
}
