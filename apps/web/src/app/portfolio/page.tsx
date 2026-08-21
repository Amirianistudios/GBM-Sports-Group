import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerPhoto } from '@/components/player-photo';
import { formatAge, positionCode, statusLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * GBM PORTFOLIO — the represented-players area.
 * Sprint 1 ships the surface honestly: it lists whatever the database marks
 * as GBM-tracked (today: none) and states plainly what arrives next. No
 * placeholder players, no fabricated entries — the portfolio fills through
 * the management workflow in the next phase, never through seed data.
 */
export default async function PortfolioPage() {
  const supabase = await createClient();

  const { data: portfolio } = await supabase
    .from('players')
    .select('id, full_name, image_url, gbm_status, date_of_birth, primary_position, clubs(name)')
    .not('gbm_status', 'in', '("NONE","UNTRACKED")')
    .order('full_name');

  const players = portfolio ?? [];

  return (
    <AppShell eyebrow="GBM" title="Portfolio">
      {players.length > 0 ? (
        <section className="px-4 md:px-6 pt-3">
          <p className="eyebrow mb-2">{players.length} represented player{players.length === 1 ? '' : 's'}</p>
          <div className="card overflow-hidden">
            {players.map((p) => {
              const club = Array.isArray(p.clubs) ? p.clubs[0] : p.clubs;
              return (
                <Link key={p.id} href={`/players/${p.id}`} className="sheet-row">
                  <div className="flex items-center gap-3">
                    <PlayerPhoto src={p.image_url} name={p.full_name} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[0.9375rem]">{p.full_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {positionCode(p.primary_position)} · {formatAge(p.date_of_birth)}y
                        {club?.name ? ` · ${club.name}` : ''}
                      </p>
                    </div>
                    <span className="badge badge-gbm">{statusLabel(p.gbm_status)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="px-4 md:px-6 pt-6">
          <div className="card p-8 max-w-xl mx-auto text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gbm-logo.png" alt="" width={48} height={48} className="rounded-[6px] mx-auto mb-4" />
            <h2 className="text-lg font-bold tracking-tight">The GBM portfolio lives here</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              Every player represented by GBM Sports Group — senior and youth — will be managed from
            this page: contract situations, documents, video, internal notes and, for minors,
              guardian-controlled information with restricted access.
            </p>
            <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
              Portfolio management (including the Add Player workflow) arrives in the next phase.
              No placeholder entries are shown — this platform never displays invented data.
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <Link
                href="/watchlists"
                className="px-3 py-2 rounded-[4px] text-sm font-semibold"
                style={{ background: 'var(--color-gbm)', color: '#fff' }}
              >
                Work the shortlists
              </Link>
              <Link
                href="/players"
                className="px-3 py-2 rounded-[4px] text-sm font-semibold"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                Browse players
              </Link>
            </div>
          </div>
        </section>
      )}
      <div className="h-8" />
    </AppShell>
  );
}
