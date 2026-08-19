import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ScoutingPage() {
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('scouting_reports')
    .select('id, player_id, observed_on, overall_rating, potential_rating, recommendation, summary, is_draft, players(full_name)')
    .order('observed_on', { ascending: false, nullsFirst: false })
    .limit(50);

  return (
    <AppShell eyebrow="GBM" title="Scouting">
      <p className="px-4 md:px-6 pt-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        GBM scout opinion is stored separately from provider statistics. The two are never mixed.
      </p>

      <div className="surface mx-4 md:mx-6 mt-3 overflow-hidden">
        {(reports ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold text-sm">No scouting reports yet</p>
            <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
              Reports written by GBM scouts appear here, with technical, tactical, physical and mental
              ratings kept apart from external data.
            </p>
          </div>
        ) : (
          (reports ?? []).map((r) => {
            const p = Array.isArray(r.players) ? r.players[0] : r.players;
            return (
              <Link key={r.id} href={`/players/${r.player_id}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[0.9375rem]">{p?.full_name}</span>
                      {r.is_draft && <span className="badge badge-neutral">draft</span>}
                    </div>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>
                      {formatDate(r.observed_on)} · {r.recommendation.toLowerCase().replaceAll('_', ' ')}
                    </p>
                  </div>
                  {r.overall_rating && (
                    <span className="data text-lg font-semibold shrink-0">{r.overall_rating}</span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
      <div className="h-8" />
    </AppShell>
  );
}
