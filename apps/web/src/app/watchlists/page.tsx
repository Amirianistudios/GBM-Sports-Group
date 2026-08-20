import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { WatchlistEntryControls, type Scout } from '@/components/watchlist-manager';
import { formatAge, positionCode, statusLabel, watchlistStatusClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * SHORTLISTS. The full recruitment workflow lives on each entry: status
 * (discovered → … → represented by GBM), priority, assigned scout, reason.
 * Rows write straight through RLS; the vocabulary is defined in lib/format.
 */
export default async function WatchlistsPage() {
  const supabase = await createClient();

  const [{ data: watchlists }, { data: scouts }] = await Promise.all([
    supabase
      .from('watchlists')
      .select('id, name, description, watchlist_players(id, status, priority, reason, assigned_scout_id, player_id, players(full_name, primary_position, date_of_birth, clubs(name)))')
      .order('created_at'),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ]);

  const scoutList = (scouts ?? []) as Scout[];
  const total = (watchlists ?? []).reduce((n, w) => n + (w.watchlist_players?.length ?? 0), 0);

  return (
    <AppShell eyebrow="GBM" title="Watchlists">
      {(watchlists ?? []).length === 0 ? (
        <div className="surface mx-4 md:mx-6 mt-4 px-4 py-12 text-center">
          <p className="font-semibold text-sm">No watchlists yet</p>
          <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
            Open any player and tap Watch. The first player you add creates your list.
          </p>
          <Link
            href="/players"
            className="inline-block mt-4 px-4 py-2 rounded-[3px] text-sm font-semibold"
            style={{ background: 'var(--color-verified)', color: '#fff' }}
          >
            Browse players
          </Link>
        </div>
      ) : (
        <>
          <p className="px-4 md:px-6 pt-3 eyebrow">
            {watchlists!.length} list{watchlists!.length === 1 ? '' : 's'} · {total} player{total === 1 ? '' : 's'}
          </p>
          {(watchlists ?? []).map((w) => (
            <section key={w.id} className="mt-3">
              <div className="px-4 md:px-6 mb-1.5">
                <h2 className="text-sm font-semibold tracking-tight">{w.name}</h2>
                {w.description && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{w.description}</p>
                )}
              </div>
              <div className="surface mx-4 md:mx-6 overflow-hidden">
                {(w.watchlist_players ?? []).length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs" style={{ color: 'var(--muted)' }}>
                    This list is empty.
                  </p>
                ) : (
                  (w.watchlist_players ?? []).map((wp) => {
                    const p = Array.isArray(wp.players) ? wp.players[0] : wp.players;
                    const club = p && (Array.isArray(p.clubs) ? p.clubs[0] : p.clubs);
                    return (
                      <div key={wp.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-3">
                          <Link href={`/players/${wp.player_id}`} className="min-w-0 flex-1">
                            <p className="font-semibold text-[0.9375rem] truncate">{p?.full_name}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                              <span className="pos-chip">
                                {positionCode(p?.primary_position)}
                                <span aria-hidden="true">·</span>
                                <span className="data">{formatAge(p?.date_of_birth)}</span>
                              </span>
                              <span className="truncate">{club?.name ?? '—'}</span>
                            </div>
                          </Link>
                          <span className={watchlistStatusClass(wp.status)}>{statusLabel(wp.status)}</span>
                        </div>
                        <div className="mt-2.5">
                          <WatchlistEntryControls
                            entryId={wp.id}
                            status={wp.status}
                            priority={wp.priority}
                            assignedScoutId={wp.assigned_scout_id}
                            reason={wp.reason}
                            scouts={scoutList}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </>
      )}
      <div className="h-8" />
    </AppShell>
  );
}
