import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerRow, type PlayerRowData } from '@/components/player-row';
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
 * PARTNER DASHBOARD.
 * The premise: the platform should be useful when nobody is searching. In
 * order: the work in progress (watched, priorities, assignments), then what
 * the data suggests looking at next, then the standing counts.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  const [
    { count: playerCount },
    { count: providerCount },
    { data: repOpps },
    { data: signals },
    { count: expiringCount },
    { count: noAgencyCount },
    { data: watched },
    { data: priorities },
    { data: assigned },
    { data: recentReports },
    { data: recentNotes },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('data_providers').select('*', { count: 'exact', head: true }).eq('is_active', true),
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
      .select('id, signal_type, score, rationale, player_id, players(full_name)')
      .eq('is_current', true)
      .order('score', { ascending: false })
      .limit(5),
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
      .from('watchlist_players')
      .select('id, status, priority, player_id, added_at, players(full_name, primary_position, date_of_birth, clubs(name))')
      .order('added_at', { ascending: false })
      .limit(5),
    supabase
      .from('watchlist_players')
      .select('id, status, priority, player_id, players(full_name, primary_position, date_of_birth, clubs(name))')
      .or('status.eq.HIGH_PRIORITY,priority.gte.4')
      .order('priority', { ascending: false, nullsFirst: false })
      .limit(5),
    userId
      ? supabase
          .from('watchlist_players')
          .select('id, status, priority, player_id, reason, players(full_name, primary_position, date_of_birth, clubs(name))')
          .eq('assigned_scout_id', userId)
          .not('status', 'in', '("REJECTED","ARCHIVED")')
          .order('priority', { ascending: false, nullsFirst: false })
          .limit(6)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('scouting_reports')
      .select('id, player_id, observed_on, overall_rating, recommendation, is_draft, players(full_name)')
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('player_notes')
      .select('id, player_id, body, created_at, players(full_name)')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const greeting = greetingForNow();

  const tiles = [
    { label: 'Players tracked', value: playerCount ?? 0, href: '/players' },
    { label: 'No agency listed', value: noAgencyCount ?? 0, href: '/representation' },
    { label: 'Contracts ≤18 months', value: expiringCount ?? 0, href: '/players?contract=18' },
    { label: 'Active providers', value: providerCount ?? 0, href: '/data' },
  ];

  const hasActivity = (recentReports ?? []).length > 0 || (recentNotes ?? []).length > 0;

  return (
    <AppShell eyebrow={greeting} title="Intelligence feed">
      <section className="px-4 md:px-6 pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="surface p-3 block">
              <div className="data text-2xl font-semibold leading-none">{t.value}</div>
              <div className="eyebrow mt-2">{t.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ASSIGNED TO ME                                                      */}
      {/* ------------------------------------------------------------------ */}
      {(assigned ?? []).length > 0 && (
        <DashSection title="Assigned to you" subtitle="Your open scouting tasks" href="/watchlists">
          {(assigned ?? []).map((wp) => (
            <WatchRow key={wp.id} entry={wp} showReason />
          ))}
        </DashSection>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PRIORITY TARGETS + WATCHED                                          */}
      {/* ------------------------------------------------------------------ */}
      {(priorities ?? []).length > 0 && (
        <DashSection title="Priority targets" subtitle="High priority across all lists" href="/watchlists">
          {(priorities ?? []).map((wp) => (
            <WatchRow key={wp.id} entry={wp} />
          ))}
        </DashSection>
      )}

      {(watched ?? []).length > 0 && (
        <DashSection title="Recently watched" subtitle="Latest additions to GBM lists" href="/watchlists">
          {(watched ?? []).map((wp) => (
            <WatchRow key={wp.id} entry={wp} />
          ))}
        </DashSection>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SCOUTING ACTIVITY                                                   */}
      {/* ------------------------------------------------------------------ */}
      {hasActivity && (
        <DashSection title="Recent scouting activity" subtitle="Reports and notes" href="/scouting">
          {(recentReports ?? []).map((r) => {
            const p = Array.isArray(r.players) ? r.players[0] : r.players;
            return (
              <Link key={`r-${r.id}`} href={`/players/${r.player_id}`} className="sheet-row">
                <div className="flex items-center gap-3">
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
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm shrink-0">{p?.full_name}</span>
                  <span className="badge badge-neutral shrink-0">note</span>
                  <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{n.body}</span>
                </div>
              </Link>
            );
          })}
        </DashSection>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* RECOMMENDED DISCOVERIES                                             */}
      {/* ------------------------------------------------------------------ */}
      <DashSection
        title="Recommended discoveries"
        subtitle="Computed from market value trend and representation state"
        href="/discover"
      >
        {(signals ?? []).length === 0 ? (
          <EmptyState title="No signals computed yet" body="Run the discovery signal job to populate this feed." />
        ) : (
          (signals ?? []).map((s) => {
            const player = Array.isArray(s.players) ? s.players[0] : s.players;
            return (
              <Link key={s.id} href={`/players/${s.player_id}`} className="sheet-row">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[0.9375rem]">
                        {player?.full_name ?? 'Unknown player'}
                      </span>
                      <span className="badge badge-neutral">{statusLabel(s.signal_type)}</span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                      {s.rationale}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </DashSection>

      {/* ------------------------------------------------------------------ */}
      {/* REPRESENTATION QUEUE                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="px-4 md:px-6 flex items-baseline justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Representation research queue</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Aged 15–23, source lists no agency
            </p>
          </div>
          <Link href="/representation" className="text-xs font-semibold" style={{ color: 'var(--color-verified-2)' }}>
            View all
          </Link>
        </div>

        {/* The single most important caveat in this product. */}
        <div
          className="mx-4 md:mx-6 mb-2 px-3 py-2 text-xs leading-relaxed rounded-[3px]"
          style={{
            background: 'color-mix(in srgb, var(--color-attention) 12%, transparent)',
            color: 'var(--color-attention-2)',
            border: '1px solid color-mix(in srgb, var(--color-attention) 28%, transparent)',
          }}
        >
          <strong>Unverified.</strong> “No agency listed” records what the source displayed. It is not
          evidence a player is unrepresented — many of these players do have representation. Verify
          before any approach.
        </div>

        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {(repOpps ?? []).length === 0 ? (
            <EmptyState
              title="Nothing in the queue"
              body="Once a representation sync has run, players whose source shows no agency appear here."
            />
          ) : (
            (repOpps as PlayerRowData[]).map((p) => <PlayerRow key={p.player_id} player={p} />)
          )}
        </div>
      </section>

      <div className="h-8" />
    </AppShell>
  );
}

type WatchEntry = {
  id: string;
  status: string;
  priority: number | null;
  player_id: string;
  reason?: string | null;
  players:
    | { full_name: string; primary_position: string | null; date_of_birth: string | null; clubs: { name: string } | { name: string }[] | null }
    | { full_name: string; primary_position: string | null; date_of_birth: string | null; clubs: { name: string } | { name: string }[] | null }[]
    | null;
};

function WatchRow({ entry, showReason = false }: { entry: WatchEntry; showReason?: boolean }) {
  const p = Array.isArray(entry.players) ? entry.players[0] : entry.players;
  const club = p && (Array.isArray(p.clubs) ? p.clubs[0] : p.clubs);
  return (
    <Link href={`/players/${entry.player_id}`} className="sheet-row">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[0.9375rem] truncate">{p?.full_name}</p>
          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="pos-chip">
              {positionCode(p?.primary_position)}
              <span aria-hidden="true">·</span>
              <span className="data">{formatAge(p?.date_of_birth)}</span>
            </span>
            <span className="truncate">{club?.name ?? '—'}</span>
            {showReason && entry.reason && (
              <span className="truncate" style={{ color: 'var(--muted)' }}>· {entry.reason}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry.priority != null && entry.priority >= 4 && (
            <span className="data text-xs" style={{ color: 'var(--color-attention-2)' }}>P{entry.priority}</span>
          )}
          <span className={watchlistStatusClass(entry.status)}>{statusLabel(entry.status)}</span>
        </div>
      </div>
    </Link>
  );
}

function DashSection({
  title, subtitle, href, children,
}: { title: string; subtitle?: string; href: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="px-4 md:px-6 flex items-baseline justify-between mb-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
        </div>
        <Link href={href} className="text-xs font-semibold" style={{ color: 'var(--color-verified-2)' }}>
          View all
        </Link>
      </div>
      <div className="surface mx-4 md:mx-6 overflow-hidden">{children}</div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
    </div>
  );
}
