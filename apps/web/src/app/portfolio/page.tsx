import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerPhoto } from '@/components/player-photo';
import { countryFlag } from '@/lib/flags';
import { formatCurrency, leagueLabel, positionCode, trend } from '@/lib/format';
import { freshness } from '@/lib/freshness';

export const dynamic = 'force-dynamic';

/**
 * GBM PORTFOLIO — relationship management, not discovery.
 *
 * Discover answers "who should we look at". This answers "how is our player
 * doing, and does anything need me today". So the card leads with recognition
 * — face, name, club — then the handful of facts an agent acts on: contract
 * runway, who at GBM is responsible, the last match, and when the platform
 * last checked. Statistics live on the profile; putting them here would turn
 * a client list back into a database.
 */

interface Row {
  player_id: string;
  status: string;
  full_name: string;
  age: number | null;
  is_minor: boolean | null;
  nationality: string | null;
  primary_position: string | null;
  club_name: string | null;
  league_name: string | null;
  market_value: number | null;
  value_change_12m_pct: number | null;
  contract_expires_on: string | null;
  contract_months_remaining: number | null;
  portrait_url: string | null;
  assigned_staff_name: string | null;
  representation_start: string | null;
  latest_match_at: string | null;
  latest_opponent: string | null;
  latest_result: string | null;
  latest_minutes: number | null;
  latest_goals: number | null;
  latest_assists: number | null;
  availability: string | null;
  last_checked_at: string | null;
  caches_refreshed_at: string | null;
  news_last_7d: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  REPRESENTED: 'Represented',
  IN_DISCUSSION: 'In discussion',
  FORMER: 'Former',
  REVIEW_QUEUE: 'Needs verification',
};

/** What an agent should notice about this player today. */
function alerts(r: Row): string[] {
  const out: string[] = [];
  if (r.contract_months_remaining !== null && r.contract_months_remaining <= 6) {
    out.push(`Contract ends in ${r.contract_months_remaining} mo`);
  }
  if (r.availability) out.push(r.availability);
  if (r.status === 'REVIEW_QUEUE') out.push('Representation unverified');
  if (r.is_minor) out.push('Minor — guardian consent required');
  return out;
}

export default async function PortfolioPage() {
  const supabase = await createClient();

  const [{ data, error }, { data: canManage }] = await Promise.all([
    supabase
      .from('v_gbm_portfolio')
      .select('*')
      .order('status')
      .order('full_name'),
    supabase.rpc('gbm_can_manage_portfolio'),
  ]);

  if (error) console.error(`[portfolio] read failed — ${error.message}`);
  const rows = (data ?? []) as Row[];
  const represented = rows.filter((r) => r.status === 'REPRESENTED');
  const other = rows.filter((r) => r.status !== 'REPRESENTED');

  return (
    <AppShell eyebrow="GBM" title="Portfolio">
      <div className="px-4 md:px-6 pt-3 flex items-start justify-between gap-4">
        <p className="text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
          Players GBM Sports Group works with. This list is GBM&#8217;s own record — an external
          site omitting a player never removes him from here.
        </p>
        {canManage === true && (
          <Link
            href="/portfolio/new"
            className="shrink-0 px-3 py-2 rounded-[4px] text-sm font-semibold"
            style={{ background: 'var(--color-gbm)', color: '#14100A' }}
          >
            + Add Player
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="px-4 md:px-6 pt-6">
          <div className="card p-8 max-w-xl mx-auto text-center">
            <h2 className="text-lg font-bold tracking-tight">No portfolio players yet</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              Nothing in the database records a GBM representation relationship. Add a player to
              start the portfolio — this platform never displays invented entries.
            </p>
          </div>
        </section>
      ) : (
        <>
          <Group title="Represented" count={represented.length} rows={represented} />
          {other.length > 0 && (
            <Group
              title="Review queue and other relationships"
              count={other.length}
              rows={other}
              subtitle="Named internally but not yet verified, in discussion, or former clients"
            />
          )}
        </>
      )}
      <div className="h-8" />
    </AppShell>
  );
}

function Group({
  title,
  subtitle,
  count,
  rows,
}: {
  title: string;
  subtitle?: string;
  count: number;
  rows: Row[];
}) {
  return (
    <section className="px-4 md:px-6 mt-5">
      <div className="mb-2">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">
          {title} <span className="data" style={{ color: 'var(--muted)' }}>{count}</span>
        </h2>
        {subtitle && <p className="text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <PortfolioCard key={r.player_id} r={r} />
        ))}
      </div>
    </section>
  );
}

function PortfolioCard({ r }: { r: Row }) {
  const flag = countryFlag(r.nationality);
  const t = r.value_change_12m_pct !== null ? trend(r.value_change_12m_pct) : null;
  const notes = alerts(r);
  const checked = freshness(r.last_checked_at ?? r.caches_refreshed_at);

  return (
    <Link href={`/players/${r.player_id}`} className="card card-interactive p-4 block">
      <div className="flex items-start gap-3">
        <PlayerPhoto src={r.portrait_url} name={r.full_name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[0.9375rem] truncate">{r.full_name}</p>
            {r.status !== 'REPRESENTED' && (
              <span className="badge">{STATUS_LABEL[r.status] ?? r.status}</span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
            {r.club_name ?? 'Club unknown'}
            {r.league_name ? ` · ${leagueLabel(r.league_name) ?? r.league_name}` : ''}
          </p>
          <p className="text-xs mt-1 data" style={{ color: 'var(--muted)' }}>
            {positionCode(r.primary_position)}
            {r.age !== null ? ` · ${r.age}y` : ''}
            {flag ? ` · ${flag}` : ''} {r.nationality ?? ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Value</p>
          <p className="data text-sm font-semibold">
            {formatCurrency(r.market_value)}
            {t && <span className={`ml-1.5 text-xs ${t.className}`}>{t.text}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Contract</p>
          <p className="data text-sm font-semibold">
            {r.contract_months_remaining !== null ? `${r.contract_months_remaining} mo` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Responsible</p>
          <p className="text-sm font-semibold truncate max-w-[9rem]">
            {r.assigned_staff_name ?? 'Unassigned'}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="eyebrow mb-1">Last match</p>
        {r.latest_match_at ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {new Date(r.latest_match_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
            {r.latest_opponent ? ` · ${r.latest_opponent}` : ''}
            {r.latest_result ? ` · ${r.latest_result}` : ''}
            {r.latest_minutes !== null ? ` · ${r.latest_minutes}'` : ''}
            {r.latest_goals ? ` · ${r.latest_goals}G` : ''}
            {r.latest_assists ? ` · ${r.latest_assists}A` : ''}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            No match data yet for this player.
          </p>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <li key={n} className="badge badge-alert">{n}</li>
          ))}
        </ul>
      )}

      <p className="eyebrow mt-3" style={{ color: 'var(--muted)' }}>
        {checked.label}
      </p>
    </Link>
  );
}
