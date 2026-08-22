import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerPhoto } from '@/components/player-photo';
import { cachedPlayerColumns, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';
import { countryFlag } from '@/lib/flags';
import { formatCurrency, positionCode, trend } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * DASHBOARD — what needs our attention.
 *
 * This replaced a nine-section feed that read like a newsletter. An agent
 * opening the platform between meetings has seconds, not minutes, so the page
 * now answers one question in five blocks and shows six players at most in
 * each. Everything here is a live production fact; the lists run on indexed
 * cached columns, so the page opens without waiting on the discovery view.
 *
 * The counts are deliberately few. Four numbers a person can hold in their
 * head beat twelve they will scroll past.
 */

/**
 * The dashboard draws from two shapes — the cached player columns and the
 * portfolio view — so the block takes the fields they share and treats every
 * one as optional. A field neither source has simply does not render.
 */
interface Row {
  player_id: string;
  full_name: string;
  age?: number | null;
  primary_position?: string | null;
  nationality?: string | null;
  club_name?: string | null;
  market_value?: number | null;
  value_change_12m_pct?: number | null;
  contract_months_remaining?: number | null;
  portrait_url?: string | null;
  image_url?: string | null;
  gbm_opportunity?: number | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const cachedCols = cachedPlayerColumns(false);

  const [
    { count: playerCount },
    { count: portfolioCount },
    { count: expiringCount },
    { data: alerts },
    priority,
    opportunities,
    portfolio,
    movement,
    { data: activity },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('gbm_portfolio').select('*', { count: 'exact', head: true }),
    supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(6)),
    supabase
      .from('alerts')
      .select('id, title, body, severity, created_at')
      .eq('is_read', false)
      .order('severity', { ascending: false })
      .limit(3),

    // Portfolio players whose contract is closing — the agency's own work first.
    supabase
      .from('v_gbm_portfolio')
      .select('*')
      .not('contract_months_remaining', 'is', null)
      .lte('contract_months_remaining', 12)
      .order('contract_months_remaining')
      .limit(6),

    supabase
      .from('players')
      .select(cachedCols)
      .order('cached_opportunity', { ascending: false, nullsFirst: false })
      .limit(6),

    supabase.from('v_gbm_portfolio').select('*').order('full_name').limit(6),

    supabase
      .from('players')
      .select(cachedCols)
      .not('cached_value_change_pct', 'is', null)
      .gte('cached_season_minutes', 450)
      .order('cached_value_change_pct', { ascending: false, nullsFirst: false })
      .limit(6),

    supabase
      .from('ingestion_runs')
      .select('job_key, status, started_at, records_updated')
      .order('started_at', { ascending: false })
      .limit(4),
  ]);

  for (const [name, r] of [
    ['priority', priority], ['opportunities', opportunities],
    ['portfolio', portfolio], ['movement', movement],
  ] as const) {
    if (r.error) console.error(`[dashboard] ${name} query failed — ${r.error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards = (r: { data: unknown }) => ((r.data ?? []) as any[]).map(fromCachedPlayer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolioRows = (r: { data: unknown }) => (r.data ?? []) as any[] as Row[];

  return (
    <AppShell eyebrow="GBM Sports Group" title="Dashboard">
      <section className="px-4 md:px-6 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Represented" value={portfolioCount ?? 0} href="/portfolio" />
          <Stat label="Contracts ≤6 mo" value={expiringCount ?? 0} href="/radar" accent />
          <Stat label="Players tracked" value={playerCount ?? 0} href="/players" />
          <Stat label="Open alerts" value={(alerts ?? []).length} accent={(alerts ?? []).length > 0} />
        </div>
      </section>

      {(alerts ?? []).length > 0 && (
        <section className="px-4 md:px-6 mt-4">
          {(alerts ?? []).map((a) => (
            <div key={a.id} className="card p-4 mb-2" style={{ borderLeft: '2px solid var(--color-gbm)' }}>
              <p className="text-sm font-semibold">{a.title}</p>
              {a.body && (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {a.body}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <Block
        title="Priority"
        subtitle="Our players with a contract inside twelve months"
        href="/portfolio"
        rows={portfolioRows(priority)}
        empty="No portfolio contracts closing inside a year."
      />

      <Block
        title="Opportunities"
        subtitle="Highest GBM fit right now"
        href="/discover"
        rows={cards(opportunities)}
        empty="No scored players yet."
      />

      <Block
        title="Portfolio"
        subtitle="Players GBM represents"
        href="/portfolio"
        rows={portfolioRows(portfolio)}
        empty="No represented players yet."
      />

      <Block
        title="Market movement"
        subtitle="Biggest twelve-month value change, with real minutes"
        href="/radar"
        rows={cards(movement)}
        empty="No valuation history yet."
      />

      <section className="px-4 md:px-6 mt-6">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">Recent activity</h2>
        <div className="card overflow-hidden">
          {(activity ?? []).length === 0 ? (
            <p className="p-4 text-sm" style={{ color: 'var(--muted)' }}>
              Nothing has run yet.
            </p>
          ) : (
            (activity ?? []).map((r, i) => (
              <div
                key={`${r.job_key}-${i}`}
                className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      r.status === 'SUCCESS' ? 'var(--color-verified)' : 'var(--color-attention)',
                  }}
                />
                <span className="text-sm flex-1 truncate">{jobLabel(r.job_key)}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {r.records_updated > 0 ? `${r.records_updated} updated · ` : ''}
                  {relative(r.started_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
      <div className="h-10" />
    </AppShell>
  );
}

const JOB_LABELS: Record<string, string> = {
  hourly_intelligence: 'Hourly intelligence',
  transfermarkt_dataset_update: 'Dataset refresh',
  entity_resolution: 'Identity resolution',
  discovery_signals: 'Discovery signals',
};
function jobLabel(key: string): string {
  return JOB_LABELS[key] ?? key;
}

/** Short relative time — the dashboard has no room for a full timestamp. */
function relative(ts: string): string {
  const mins = (Date.now() - Date.parse(ts)) / 60000;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div className="card p-4 h-full">
      <p
        className="data text-2xl font-bold tracking-tight"
        style={accent && value > 0 ? { color: 'var(--color-gbm)' } : undefined}
      >
        {value.toLocaleString('en-GB')}
      </p>
      <p className="eyebrow mt-1">{label}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block card-interactive rounded-[6px]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * One block, at most six players, three columns. The same shape every time so
 * the eye learns it once.
 */
function Block({
  title,
  subtitle,
  href,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  href: string;
  rows: Row[];
  empty: string;
}) {
  return (
    <section className="px-4 md:px-6 mt-6">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </p>
        </div>
        <Link href={href} className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-verified-2)' }}>
          View all
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="card p-5">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {empty}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <MiniCard key={p.player_id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Recognition first: a face, a name, where he plays, one number. */
function MiniCard({ p }: { p: Row }) {
  const months = p.contract_months_remaining ?? null;
  const t = p.value_change_12m_pct != null ? trend(p.value_change_12m_pct) : null;
  const flag = countryFlag(p.nationality);
  const urgent = months !== null && months <= 6;

  return (
    <Link href={`/players/${p.player_id}`} className="card card-interactive p-3 flex items-center gap-3">
      <PlayerPhoto src={p.portrait_url ?? p.image_url ?? null} name={p.full_name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{p.full_name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
          {[
            positionCode(p.primary_position),
            p.age != null ? `${Math.floor(Number(p.age))}` : null,
            flag ?? null,
            p.club_name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="data text-sm font-semibold">{formatCurrency(p.market_value)}</p>
        {urgent ? (
          <p className="data text-[0.6875rem]" style={{ color: 'var(--color-gbm)' }}>
            {months} mo left
          </p>
        ) : t ? (
          <p className={`data text-[0.6875rem] ${t.className}`}>{t.text}</p>
        ) : null}
      </div>
    </Link>
  );
}
