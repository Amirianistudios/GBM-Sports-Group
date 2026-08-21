import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { PlayerPhoto } from '@/components/player-photo';
import { formatAge, formatDate, positionCode, statusLabel, watchlistStatusClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Clock reads live outside the component body. The page is force-dynamic, so
 * every request genuinely re-evaluates these — but React's purity rule (rightly)
 * refuses to see `Date.now()` inline in a component, since that is how stale
 * prerenders and hydration mismatches happen.
 */
const CONTRACT_HORIZON_DAYS = 547; // 18 months

function contractHorizonDate(): string {
  return new Date(Date.now() + CONTRACT_HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
}

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * THE INTELLIGENCE FEED.
 * The first screen after login answers "what should I pay attention to
 * today?" — rising players, emerging U21s, contract situations, research
 * queues and the scout's own work — before it reports any database totals.
 * Every number on this page is a live production fact; nothing is estimated.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  const [
    { count: playerCount },
    { count: providerCount },
    { data: rising },
    { data: emergingU21 },
    { data: contractOpps },
    { data: repOpps },
    { data: signals },
    { count: expiringCount },
    { count: noAgencyCount },
    { data: portfolio },
    { data: watched },
    { data: priorities },
    { data: assigned },
    { data: recentReports },
    { data: recentNotes },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('data_providers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('v_player_discovery')
      .select('*')
      .not('value_change_12m_pct', 'is', null)
      .gte('season_minutes', 450)
      .order('value_change_12m_pct', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('v_player_discovery')
      .select('*')
      .lte('age', 21)
      .gte('season_minutes', 900)
      .order('market_value', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('v_player_discovery')
      .select('*')
      .not('contract_months_remaining', 'is', null)
      .lte('contract_months_remaining', 18)
      .gte('market_value', 1_000_000)
      .order('market_value', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('v_representation_opportunities')
      .select('*')
      .eq('representation_status', 'NO_AGENCY_LISTED')
      .gte('age', 15)
      .lte('age', 23)
      .order('value_change_12m_pct', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('discovery_signals')
      .select('id, signal_type, score, rationale, player_id, players(full_name, image_url)')
      .eq('is_current', true)
      .order('score', { ascending: false })
      .limit(4),
    supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .lte('expires_on', contractHorizonDate()),
    supabase
      .from('representation_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'NO_AGENCY_LISTED')
      .eq('is_current', true),
    supabase
      .from('players')
      .select('id, full_name, image_url, gbm_status')
      .not('gbm_status', 'in', '("NONE","UNTRACKED")')
      .limit(6),
    supabase
      .from('watchlist_players')
      .select('id, status, priority, player_id, added_at, players(full_name, image_url, primary_position, date_of_birth, clubs(name))')
      .order('added_at', { ascending: false })
      .limit(5),
    supabase
      .from('watchlist_players')
      .select('id, status, priority, player_id, players(full_name, image_url, primary_position, date_of_birth, clubs(name))')
      .or('status.eq.HIGH_PRIORITY,priority.gte.4')
      .order('priority', { ascending: false, nullsFirst: false })
      .limit(5),
    userId
      ? supabase
          .from('watchlist_players')
          .select('id, status, priority, player_id, reason, players(full_name, image_url, primary_position, date_of_birth, clubs(name))')
          .eq('assigned_scout_id', userId)
          .not('status', 'in', '("REJECTED","ARCHIVED")')
          .order('priority', { ascending: false, nullsFirst: false })
          .limit(6)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('scouting_reports')
      .select('id, player_id, observed_on, overall_rating, recommendation, is_draft, players(full_name, image_url)')
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('player_notes')
      .select('id, player_id, body, created_at, players(full_name, image_url)')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const greeting = greetingForNow();
  const hasActivity = (recentReports ?? []).length > 0 || (recentNotes ?? []).length > 0;
  const hasWork = (assigned ?? []).length > 0 || (priorities ?? []).length > 0 || (watched ?? []).length > 0;

  return (
    <AppShell eyebrow={greeting} title="Intelligence feed">
      {/* Headline counts, compressed to one strip — intelligence outranks totals. */}
      <section className="px-4 md:px-6 pt-3 pb-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-baseline">
          <Stat href="/players" value={playerCount ?? 0} label="players" />
          <Stat href="/representation" value={noAgencyCount ?? 0} label="no agency listed" />
          <Stat href="/players?contract=18" value={expiringCount ?? 0} label="contracts ≤18 mo" />
          <Stat href="/data" value={providerCount ?? 0} label="providers" />
        </div>
      </section>

      {/* -------------------- The scout's own work first ------------------- */}
      {(assigned ?? []).length > 0 && (
        <Feed title="Assigned to you" subtitle="Your open scouting tasks" href="/watchlists">
          {(assigned ?? []).map((wp) => <WatchRow key={wp.id} entry={wp} showReason />)}
        </Feed>
      )}

      {/* ------------------------- Market intelligence --------------------- */}
      <Feed title="Rising players" subtitle="Strongest 12-month value growth, 450+ minutes this season" href="/players?sort=growth">
        {((rising ?? []) as PlayerCardData[]).map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {(rising ?? []).length === 0 && <Empty text="No value-trend data yet." />}
      </Feed>

      <Feed title="Emerging U21" subtitle="Under-21s with real first-team minutes" href="/players?ageMax=21&minMinutes=900&sort=value">
        {((emergingU21 ?? []) as PlayerCardData[]).map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {(emergingU21 ?? []).length === 0 && <Empty text="No U21 players above the minutes floor." />}
      </Feed>

      <Feed title="Contract opportunities" subtitle="Valued players inside 18 months of expiry" href="/players?contract=18&sort=value">
        {((contractOpps ?? []) as PlayerCardData[]).map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {(contractOpps ?? []).length === 0 && <Empty text="No expiring contracts recorded." />}
      </Feed>

      {(signals ?? []).length > 0 && (
        <Feed title="Recommended discoveries" subtitle="Computed from market value trend and representation state" href="/discover">
          {(signals ?? []).map((s) => {
            const p = Array.isArray(s.players) ? s.players[0] : s.players;
            return (
              <Link key={s.id} href={`/players/${s.player_id}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <PlayerPhoto src={p?.image_url ?? null} name={p?.full_name ?? '—'} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[0.9375rem]">{p?.full_name}</span>
                      <span className="badge badge-neutral">{statusLabel(s.signal_type)}</span>
                    </div>
                    {s.rationale && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{s.rationale}</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </Feed>
      )}

      {/* ------------------------ Representation research ------------------ */}
      <Feed title="Representation research" subtitle="Aged 15–23, source lists no agency" href="/representation">
        <p
          className="px-4 py-2 text-xs leading-relaxed"
          style={{
            background: 'color-mix(in srgb, var(--color-attention) 10%, transparent)',
            color: 'var(--color-attention-2)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <strong>Unverified.</strong> “No agency listed” records what the source displayed. It is not
          evidence a player is unrepresented — verify before any approach.
        </p>
        {((repOpps ?? []) as PlayerCardData[]).map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {(repOpps ?? []).length === 0 && <Empty text="Nothing in the queue." />}
      </Feed>

      {/* ------------------------------ GBM layer -------------------------- */}
      <Feed title="GBM portfolio" subtitle="Players represented by GBM Sports Group" href="/portfolio">
        {(portfolio ?? []).length > 0 ? (
          (portfolio ?? []).map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="sheet-row">
              <div className="flex items-center gap-3">
                <PlayerPhoto src={p.image_url} name={p.full_name} size={40} />
                <span className="font-semibold text-[0.9375rem] flex-1">{p.full_name}</span>
                <span className="badge badge-gbm">GBM · {statusLabel(p.gbm_status)}</span>
              </div>
            </Link>
          ))
        ) : (
          <Empty text="Portfolio management arrives in the next phase — represented players will appear here." />
        )}
      </Feed>

      {hasWork && (priorities ?? []).length > 0 && (
        <Feed title="Priority targets" subtitle="High priority across all lists" href="/watchlists">
          {(priorities ?? []).map((wp) => <WatchRow key={wp.id} entry={wp} />)}
        </Feed>
      )}

      {(watched ?? []).length > 0 && (
        <Feed title="Recently watched" subtitle="Latest additions to GBM lists" href="/watchlists">
          {(watched ?? []).map((wp) => <WatchRow key={wp.id} entry={wp} />)}
        </Feed>
      )}

      {hasActivity && (
        <Feed title="Recent internal activity" subtitle="Reports and notes" href="/scouting">
          {(recentReports ?? []).map((r) => {
            const p = Array.isArray(r.players) ? r.players[0] : r.players;
            return (
              <Link key={`r-${r.id}`} href={`/players/${r.player_id}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <PlayerPhoto src={p?.image_url ?? null} name={p?.full_name ?? '—'} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[0.9375rem]">{p?.full_name}</span>
                      <span className="badge badge-neutral">report</span>
                      {r.is_draft && <span className="badge badge-neutral">draft</span>}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {formatDate(r.observed_on)} · {statusLabel(r.recommendation)}
                    </p>
                  </div>
                  {r.overall_rating && (
                    <span className="data shrink-0">
                      <span className="text-lg font-semibold">{r.overall_rating}</span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>/10</span>
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          {(recentNotes ?? []).map((n) => {
            const p = Array.isArray(n.players) ? n.players[0] : n.players;
            return (
              <Link key={`n-${n.id}`} href={`/players/${n.player_id}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <PlayerPhoto src={p?.image_url ?? null} name={p?.full_name ?? '—'} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[0.9375rem]">{p?.full_name}</span>
                      <span className="badge badge-neutral">note</span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{n.body}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </Feed>
      )}

      <div className="h-8" />
    </AppShell>
  );
}

/* ---------------------------------------------------------------------- */

function Stat({ href, value, label }: { href: string; value: number; label: string }) {
  return (
    <Link href={href} className="stat-strip group">
      <span className="data text-lg font-semibold leading-none group-hover:underline">{value.toLocaleString('en-GB')}</span>
      <span className="eyebrow" style={{ fontSize: '0.625rem' }}>{label}</span>
    </Link>
  );
}

function Feed({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 md:px-6 mt-5">
      <div className="flex items-baseline justify-between mb-1.5">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-verified-2)' }}>
            View all
          </Link>
        )}
      </div>
      <div className="card overflow-hidden">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--muted)' }}>{text}</p>
  );
}

type WatchEntry = {
  id: string;
  status: string | null;
  priority: number | null;
  player_id: string;
  reason?: string | null;
  players:
    | { full_name: string; image_url: string | null; primary_position: string | null; date_of_birth: string | null; clubs: { name: string } | { name: string }[] | null }
    | Array<{ full_name: string; image_url: string | null; primary_position: string | null; date_of_birth: string | null; clubs: { name: string } | { name: string }[] | null }>
    | null;
};

function WatchRow({ entry, showReason = false }: { entry: WatchEntry; showReason?: boolean }) {
  const p = Array.isArray(entry.players) ? entry.players[0] : entry.players;
  const club = p?.clubs ? (Array.isArray(p.clubs) ? p.clubs[0]?.name : p.clubs.name) : null;
  return (
    <Link href={`/players/${entry.player_id}`} className="sheet-row">
      <div className="flex items-center gap-3">
        <PlayerPhoto src={p?.image_url ?? null} name={p?.full_name ?? '—'} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[0.9375rem]">{p?.full_name ?? 'Unknown player'}</span>
          </div>
          <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--muted)' }}>
            <span className="pos-chip">
              {positionCode(p?.primary_position)}
              <span aria-hidden="true">·</span>
              <span className="data">{formatAge(p?.date_of_birth)}</span>
            </span>
            {club && <span>{club}</span>}
            {showReason && entry.reason && <span className="truncate">· {entry.reason}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {entry.priority != null && entry.priority >= 4 && (
            <span className="data text-xs font-bold" style={{ color: 'var(--color-attention-2)' }}>P{entry.priority}</span>
          )}
          <span className={watchlistStatusClass(entry.status)}>{statusLabel(entry.status)}</span>
        </div>
      </div>
    </Link>
  );
}
