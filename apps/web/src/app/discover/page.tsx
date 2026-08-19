import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

const SIGNAL_COPY: Record<string, { title: string; blurb: string }> = {
  RAPID_VALUE_GROWTH: {
    title: 'Rapid value growth',
    blurb: 'Market value rising sharply over 12 months.',
  },
  UNREPRESENTED_HIGH_POTENTIAL: {
    title: 'No agency listed, high potential',
    blurb: 'Young, well-valued, and the source shows no agency. Requires verification.',
  },
  CONTRACT_EXPIRING: {
    title: 'Contract ending',
    blurb: 'Inside the final 18 months.',
  },
};

export default async function DiscoverPage() {
  const supabase = await createClient();

  const { data: signals } = await supabase
    .from('discovery_signals')
    .select('id, signal_type, score, rationale, player_id, players(full_name, primary_position, date_of_birth)')
    .eq('is_current', true)
    .order('score', { ascending: false })
    .limit(60);

  const grouped = new Map<string, typeof signals>();
  for (const s of signals ?? []) {
    const list = grouped.get(s.signal_type) ?? [];
    list.push(s);
    grouped.set(s.signal_type, list as typeof signals);
  }

  return (
    <AppShell eyebrow="Intelligence" title="Discover">
      <p className="px-4 md:px-6 pt-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Signals are computed from the data GBM holds, and each one states its reasoning. A signal you
        cannot explain is a signal you cannot act on.
      </p>

      {grouped.size === 0 && (
        <div className="surface mx-4 md:mx-6 mt-4 px-4 py-12 text-center">
          <p className="font-semibold text-sm">No signals yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Run the discovery signal job to populate this page.
          </p>
        </div>
      )}

      {[...grouped.entries()].map(([type, list]) => {
        const copy = SIGNAL_COPY[type] ?? { title: type.replaceAll('_', ' '), blurb: '' };
        return (
          <section key={type} className="mt-5">
            <div className="px-4 md:px-6 mb-1.5">
              <h2 className="text-sm font-semibold tracking-tight">{copy.title}</h2>
              {copy.blurb && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{copy.blurb}</p>
              )}
            </div>
            <div className="surface mx-4 md:mx-6 overflow-hidden">
              {(list ?? []).slice(0, 8).map((s) => {
                const p = Array.isArray(s.players) ? s.players[0] : s.players;
                return (
                  <Link key={s.id} href={`/players/${s.player_id}`} className="sheet-row">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[0.9375rem]">{p?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                          {s.rationale}
                        </p>
                      </div>
                      <span className="data text-sm font-semibold shrink-0" style={{ color: 'var(--color-verified-2)' }}>
                        {Number(s.score).toFixed(0)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="h-8" />
    </AppShell>
  );
}
