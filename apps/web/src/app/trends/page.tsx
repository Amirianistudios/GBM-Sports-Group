import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatCurrency, leagueLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * TRENDS — cohort analytics the current dataset genuinely supports.
 * Everything is computed server-side from v_player_discovery rows: medians
 * by age band and position, twelve-month value drift, league concentration.
 * Bars encode magnitude in a single hue with the value labelled directly;
 * cohort sizes are always shown, because a median over nine players is a
 * different fact than one over three hundred. This page describes the
 * imported population — not world football.
 */

interface Row {
  age: number | null;
  primary_position: string | null;
  market_value: number | null;
  value_change_12m_pct: number | null;
  league_name: string | null;
  season_minutes: number | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const AGE_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: '16–18', min: 16, max: 18.999 },
  { label: '19–21', min: 19, max: 21.999 },
  { label: '22–24', min: 22, max: 24.999 },
  { label: '25–28', min: 25, max: 28.999 },
  { label: '29–32', min: 29, max: 32.999 },
  { label: '33+', min: 33, max: 99 },
];

const POSITION_GROUPS: Array<{ label: string; match: (p: string) => boolean }> = [
  { label: 'Goalkeepers', match: (p) => p === 'Goalkeeper' },
  { label: 'Centre-backs', match: (p) => p === 'Centre-Back' },
  { label: 'Full-backs', match: (p) => p === 'Left-Back' || p === 'Right-Back' },
  { label: 'Defensive mid', match: (p) => p === 'Defensive Midfield' },
  { label: 'Central mid', match: (p) => p === 'Central Midfield' },
  { label: 'Attacking mid', match: (p) => p === 'Attacking Midfield' },
  { label: 'Wingers', match: (p) => p.includes('Winger') || p === 'Left Midfield' || p === 'Right Midfield' },
  { label: 'Strikers', match: (p) => p === 'Centre-Forward' || p === 'Second Striker' },
];

export default async function TrendsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('v_player_discovery')
    .select('age, primary_position, market_value, value_change_12m_pct, league_name, season_minutes');

  const rows = (data ?? []) as Row[];
  const valued = rows.filter((r) => r.market_value !== null && r.market_value > 0);

  const byAge = AGE_BANDS.map((b) => {
    const cohort = valued.filter((r) => r.age !== null && Number(r.age) >= b.min && Number(r.age) <= b.max);
    return {
      label: b.label,
      n: cohort.length,
      median: median(cohort.map((r) => Number(r.market_value))),
      medianChange: median(
        cohort.filter((r) => r.value_change_12m_pct !== null).map((r) => Number(r.value_change_12m_pct)),
      ),
    };
  }).filter((b) => b.n > 0);

  const byPosition = POSITION_GROUPS.map((g) => {
    const cohort = valued.filter((r) => r.primary_position && g.match(r.primary_position));
    return {
      label: g.label,
      n: cohort.length,
      median: median(cohort.map((r) => Number(r.market_value))),
    };
  }).filter((g) => g.n > 0);

  const byLeague = Object.entries(
    valued.reduce<Record<string, { total: number; n: number }>>((acc, r) => {
      if (!r.league_name) return acc;
      acc[r.league_name] = acc[r.league_name] ?? { total: 0, n: 0 };
      acc[r.league_name].total += Number(r.market_value);
      acc[r.league_name].n += 1;
      return acc;
    }, {}),
  )
    .map(([label, v]) => ({ label, total: v.total, n: v.n }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const maxAgeMedian = Math.max(...byAge.map((b) => b.median ?? 0), 1);
  const maxPosMedian = Math.max(...byPosition.map((b) => b.median ?? 0), 1);
  const maxLeague = Math.max(...byLeague.map((b) => b.total), 1);

  return (
    <AppShell eyebrow="Intelligence" title="Trends">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Cohort patterns across the {rows.length.toLocaleString('en-GB')} tracked players with recorded
        valuations. Medians, not means — one €200m player would otherwise move an entire cohort.
        These figures describe this database, not world football.
      </p>

      <Panel title="Median market value by age" subtitle="Peak value sits where careers peak — the age curve of the tracked market">
        {byAge.map((b) => (
          <BarRow
            key={b.label}
            label={b.label}
            n={b.n}
            value={formatCurrency(b.median)}
            pct={((b.median ?? 0) / maxAgeMedian) * 100}
          />
        ))}
      </Panel>

      <Panel title="12-month value drift by age" subtitle="Median change — where the market is moving, by cohort">
        {byAge.filter((b) => b.medianChange !== null).map((b) => {
          const v = b.medianChange as number;
          return (
            <div key={b.label} className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="data text-xs w-12 shrink-0" style={{ color: 'var(--muted)' }}>{b.label}</span>
              <div className="flex-1 flex items-center" aria-hidden="true">
                <div className="w-1/2 flex justify-end">
                  {v < 0 && (
                    <div
                      className="h-3 rounded-l-[4px]"
                      style={{ width: `${Math.min(Math.abs(v), 100)}%`, background: 'var(--color-conflict)', opacity: 0.75 }}
                    />
                  )}
                </div>
                <div className="w-px h-4" style={{ background: 'var(--border-strong)' }} />
                <div className="w-1/2">
                  {v >= 0 && (
                    <div
                      className="h-3 rounded-r-[4px]"
                      style={{ width: `${Math.min(v, 100)}%`, background: 'var(--color-verified)', opacity: 0.85 }}
                    />
                  )}
                </div>
              </div>
              <span className={`data text-xs font-semibold w-14 text-right shrink-0 ${v >= 0 ? 'trend-up' : 'trend-down'}`}>
                {v > 0 ? '+' : ''}{v.toFixed(0)}%
              </span>
              <span className="data text-[0.625rem] w-12 text-right shrink-0" style={{ color: 'var(--muted)' }}>n={b.n}</span>
            </div>
          );
        })}
      </Panel>

      <Panel title="Median market value by position" subtitle="What each role costs in the tracked market">
        {byPosition.map((b) => (
          <BarRow
            key={b.label}
            label={b.label}
            n={b.n}
            value={formatCurrency(b.median)}
            pct={((b.median ?? 0) / maxPosMedian) * 100}
            wideLabel
          />
        ))}
      </Panel>

      <Panel title="Value concentration by league" subtitle="Total tracked market value, top leagues">
        {byLeague.map((b) => (
          <BarRow
            key={b.label}
            label={leagueLabel(b.label) ?? b.label}
            n={b.n}
            value={formatCurrency(b.total)}
            pct={(b.total / maxLeague) * 100}
            wideLabel
          />
        ))}
      </Panel>

      <div className="h-8" />
    </AppShell>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="px-4 md:px-6 mt-5">
      <div className="mb-1.5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      <div className="card overflow-hidden">{children}</div>
    </section>
  );
}

/** Magnitude bar: one hue, value labelled directly, cohort size visible. */
function BarRow({
  label, n, value, pct, wideLabel = false,
}: { label: string; n: number; value: string; pct: number; wideLabel?: boolean }) {
  return (
    <div className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className={`text-xs shrink-0 truncate ${wideLabel ? 'w-28' : 'data w-12'}`} style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div className="flex-1" aria-hidden="true">
        <div
          className="h-3 rounded-[4px]"
          style={{
            width: `${Math.max(pct, 1.5)}%`,
            background: 'color-mix(in srgb, var(--color-verified) 78%, var(--color-ink))',
          }}
        />
      </div>
      <span className="data text-xs font-semibold w-16 text-right shrink-0">{value}</span>
      <span className="data text-[0.625rem] w-12 text-right shrink-0" style={{ color: 'var(--muted)' }}>n={n}</span>
    </div>
  );
}
