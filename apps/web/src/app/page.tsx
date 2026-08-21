import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { PlayerPhoto } from '@/components/player-photo';
import { cachedPlayerColumns, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';
import { ALL_TARGET_COUNTRIES } from '@/lib/markets';
import { formatAge, positionCode, statusLabel, watchlistStatusClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * GBM MORNING BRIEF.
 * The first screen after login reads like the agency's daily briefing:
 * what needs attention, where the opportunities are moving, what entered
 * the markets GBM actually works. Every number is a live production fact;
 * list queries run on indexed cached columns so the brief opens instantly.
 *
 * Clock reads live outside the component body — the page is force-dynamic,
 * and React's purity rule (rightly) refuses Date.now() inline in render.
 */
function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

function dateLine(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  const cachedCols = cachedPlayerColumns(false);

  const [
    { count: playerCount },
    { count: targetMarketCount },
    { count: expiringCount },
    { count: noAgencyCount },
    attention,
    rising,
    gainers,
    fallers,
    newInMarkets,
    contractOpps,
    { data: repOpps },
    { data: portfolio },
    { data: assigned },
    { data: priorities },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase
      .from('players')
      .select('id, countries!players_nationality_country_id_fkey!inner(name)', { count: 'exact', head: true })
      .in('countries.name', ALL_TARGET_COUNTRIES),
    supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(18)),
    supabase
      .from('representation_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'NO_AGENCY_LISTED')
      .eq('is_current', true),
    // Requiring attention today: relevant players entering the final six months.
    supabase
      .from('players')
      .select(cachedCols)
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(6))
      .order('cached_opportunity', { ascending: false, nullsFirst: false })
      .limit(5),
    // Rising opportunities: meaningful growth, ranked by GBM fit.
    supabase
      .from('players')
      .select(cachedCols)
      .gte('cached_value_change_pct', 25)
      .gte('cached_season_minutes', 450)
      .order('cached_opportunity', { ascending: false, nullsFirst: false })
      .limit(5),
    // Market movements: the biggest swings either way.
    supabase
      .from('players')
      .select(cachedCols)
      .not('cached_value_change_pct', 'is', null)
      .gte('cached_season_minutes', 450)
      .order('cached_value_change_pct', { ascending: false })
      .limit(3),
    supabase
      .from('players')
      .select(cachedCols)
      .not('cached_value_change_pct', 'is', null)
      .gte('cached_season_minutes', 450)
      .order('cached_value_change_pct', { ascending: true })
      .limit(3),
    // New players entering GBM markets.
    supabase
      .from('players')
      .select(cachedPlayerColumns(true))
      .in('nationality.name', ALL_TARGET_COUNTRIES)
      .order('created_at', { ascending: false })
      .limit(5),
    // Contract situations inside the 18-month window, ranked by GBM fit.
    supabase
      .from('players')
      .select(cachedCols)
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(18))
      .gte('cached_market_value', 250_000)
      .order('cached_opportunity', { ascending: false, nullsFirst: false })
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
      .from('players')
      .select('id, full_name, image_url, gbm_status')
      .not('gbm_status', 'in', '("NONE","UNTRACKED")')
      .limit(6),
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
      .from('watchlist_players')
      .select('id, status, priority, player_id, players(full_name, image_url, primary_position, date_of_birth, clubs(name))')
      .or('status.eq.HIGH_PRIORITY,priority.gte.4')
      .order('priority', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (r: { data: unknown }) => ((r.data ?? []) as any[]).map(fromCachedPlayer);
  const attentionRows = rows(attention);
  const risingRows = rows(rising);
  const newMarketRows = rows(newInMarkets);
  const contractRows = rows(contractOpps);
  const movementRows = [...rows(gainers), ...rows(fallers)].sort(
    (a, b) => Math.abs(b.value_change_12m_pct ?? 0) - Math.abs(a.value_change_12m_pct ?? 0),
  );

  const greeting = greetingForNow();

  return (
    <AppShell eyebrow={greeting} title="Morning Brief">
      {/* Masthead — the daily briefing header. */}
      <section className="px-4 md:px-6 pt-3">
        <div className="hero-surface px-4 py-4 md:px-6 md:py-5">
          <p className="eyebrow" style={{ color: 'var(--color-gbm)' }}>GBM Sports Group · Internal</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Morning Brief</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{dateLine()}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-baseline mt-4">
            <Stat href="/players" value={playerCount ?? 0} label="players tracked" />
            <Stat href="/discover" value={targetMarketCount ?? 0} label="in GBM markets" />
            <Stat href="/players?contract=18" value={expiringCount ?? 0} label="contracts ≤18 mo" />
            <Stat href="/representation" value={noAgencyCount ?? 0} label="no agency listed" />
          </div>
        </div>
      </section>

      {/* 1 — players requiring attention today */}
      <Feed title="Requiring attention" subtitle="Contracts entering the final six months, ranked by GBM fit" href="/players?contract=6">
        {attentionRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {attentionRows.length === 0 && <Empty text="No contracts inside six months." />}
      </Feed>

      {/* 2 — scouting tasks */}
      {(assigned ?? []).length > 0 && (
        <Feed title="Your scouting tasks" subtitle="Assigned to you" href="/watchlists">
          {(assigned ?? []).map((wp) => <WatchRow key={wp.id} entry={wp} showReason />)}
        </Feed>
      )}
      {(priorities ?? []).length > 0 && (
        <Feed title="Priority targets" subtitle="High priority across all lists" href="/watchlists">
          {(priorities ?? []).map((wp) => <WatchRow key={wp.id} entry={wp} />)}
        </Feed>
      )}

      {/* 3 — rising opportunities */}
      <Feed title="Rising opportunities" subtitle="Value up 25%+ with real minutes, ranked by GBM fit" href="/discover">
        {risingRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {risingRows.length === 0 && <Empty text="No value-trend data yet." />}
      </Feed>

      {/* 4 — new players entering GBM markets */}
      <Feed title="New in GBM markets" subtitle="Latest target-market players to enter the platform" href="/discover">
        {newMarketRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {newMarketRows.length === 0 && <Empty text="No target-market players yet — imports are landing." />}
      </Feed>

      {/* 5 — contract situations */}
      <Feed title="Contract situations" subtitle="Inside 18 months, valued, ranked by GBM fit" href="/players?contract=18">
        {contractRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {contractRows.length === 0 && <Empty text="No expiring contracts recorded." />}
      </Feed>

      {/* 6 — internal portfolio */}
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

      {/* 7 — market movements */}
      <Feed title="Market movements" subtitle="The biggest 12-month swings, both directions" href="/radar">
        {movementRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)}
        {movementRows.length === 0 && <Empty text="No movement data yet." />}
      </Feed>

      {/* Representation research keeps its caveat wherever it appears. */}
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
