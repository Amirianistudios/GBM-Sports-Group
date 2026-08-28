import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatCurrency, leagueLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * TRENDS — cohort analytics the current dataset genuinely supports.
 *
 * All aggregation happens in the database via `gbm_trends_report()`. The
 * previous version pulled the players table into JavaScript, silently
 * received at most 1,000 of 13,296 rows (the response cap), computed medians
 * on that sample, and printed the truncated count as "the N tracked
 * players" — the exact defect the clubs page documents having fixed for
 * itself. SQL sees every row and says how many it saw.
 *
 * Bars encode magnitude in a single hue with the value labelled directly;
 * cohort sizes are always shown, because a median over nine players is a
 * different fact than one over three hundred. This page describes the
 * imported population — not world football.
 */

interface AgeBand {
  label: string;
  n: number;
  median: number | null;
  median_change: number | null;
}
interface PositionBand {
  label: string;
  n: number;
  median: number | null;
}
interface LeagueBand {
  label: string;
  n: number;
  total: number;
}

export default async function TrendsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gbm_trends_report');

  if (error || !data) {
    return (
      <AppShell eyebrow="Intelligence" title="Trends">
        <div className="surface mx-4 md:mx-6 mt-4 px-4 py-10 text-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--color-conflict)' }}>
            The trends report could not be computed
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {error?.message ?? 'The report returned nothing.'}
          </p>
        </div>
      </AppShell>
    );
  }

  const report = data as unknown as {
    population: number;
    valued: number;
    by_age: AgeBand[];
    by_position: PositionBand[];
    by_league: LeagueBand[];
  };

  const byAge = (report.by_age ?? []).filter((b) => b.n > 0);
  const byPosition = (report.by_position ?? []).filter((b) => b.n > 0);
  const byLeague = report.by_league ?? [];

  const maxAgeMedian = Math.max(...byAge.map((b) => b.median ?? 0), 1);
  const maxPosMedian = Math.max(...byPosition.map((b) => b.median ?? 0), 1);
  const maxLeague = Math.max(...byLeague.map((b) => b.total), 1);

  return (
    <AppShell eyebrow="Intelligence" title="Trends">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Cohort patterns across {report.valued.toLocaleString('en-GB')} of the{' '}
        {report.population.toLocaleString('en-GB')} tracked players — those with a recorded
        valuation. Medians, not means — one €200m player would otherwise move an entire cohort.
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
        {byAge.filter((b) => b.median_change !== null).map((b) => {
          const v = b.median_change as number;
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
