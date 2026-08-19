import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerRow, type PlayerRowData } from '@/components/player-row';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | undefined>>;

/**
 * REPRESENTATION OPPORTUNITIES.
 *
 * The most commercially sensitive screen in the platform, and the one most
 * likely to be misread. Everything here is framed as research, not as a
 * target list, because the underlying signal ("the source showed no agency")
 * is much weaker than it looks.
 */
export default async function RepresentationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const ageMin = Number(sp.ageMin ?? 15);
  const ageMax = Number(sp.ageMax ?? 23);

  const { data, error } = await supabase
    .from('v_representation_opportunities')
    .select('*')
    .eq('representation_status', 'NO_AGENCY_LISTED')
    .gte('age', ageMin)
    .lte('age', ageMax)
    .order('value_change_12m_pct', { ascending: false, nullsFirst: false })
    .limit(100);

  return (
    <AppShell eyebrow="Intelligence" title="Representation">
      <div className="px-4 md:px-6 pt-3">
        <div
          className="px-3 py-3 text-xs leading-relaxed rounded-[3px]"
          style={{
            background: 'color-mix(in srgb, var(--color-attention) 12%, transparent)',
            color: 'var(--color-attention-2)',
            border: '1px solid color-mix(in srgb, var(--color-attention) 28%, transparent)',
          }}
        >
          <p className="font-semibold mb-1">Read this before acting on the list</p>
          <p>
            These players appear because a source displayed <em>no agency</em> — not because they are
            unrepresented. Coverage of agency data is incomplete, and elite young players frequently
            have representation that is never published. Treat this as a research queue: verify each
            player independently before any contact.
          </p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 flex items-baseline justify-between">
        <p className="eyebrow">
          {error ? 'Query failed' : `${data?.length ?? 0} to research`} · age {ageMin}–{ageMax}
        </p>
      </div>

      <div className="surface mx-4 md:mx-6 overflow-hidden">
        {error ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-conflict)' }}>
              Could not load the queue
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{error.message}</p>
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold text-sm">Nothing to research in this age range</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Run a representation sync, or widen the age range.
            </p>
          </div>
        ) : (
          (data as PlayerRowData[]).map((p) => <PlayerRow key={p.player_id} player={p} />)
        )}
      </div>
      <div className="h-8" />
    </AppShell>
  );
}
