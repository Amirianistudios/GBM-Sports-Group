import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerRow, type PlayerRowData } from '@/components/player-row';
import { PlayerFilters } from '@/components/player-filters';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | undefined>>;

type Foot = 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN';
const FOOT_VALUES: Foot[] = ['LEFT', 'RIGHT', 'BOTH', 'UNKNOWN'];

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase.from('v_representation_opportunities').select('*');

  if (sp.q) query = query.ilike('full_name', `%${sp.q}%`);
  if (sp.position) query = query.eq('primary_position', sp.position);
  if (sp.nationality) query = query.eq('nationality', sp.nationality);
  // Validate against the enum rather than trusting the query string: an
  // arbitrary ?foot= value would otherwise reach Postgres as a bad cast.
  if (sp.foot && FOOT_VALUES.includes(sp.foot as Foot)) {
    query = query.eq('foot', sp.foot as Foot);
  }
  if (sp.agency === 'none') query = query.eq('representation_status', 'NO_AGENCY_LISTED');
  if (sp.agency === 'known') query = query.eq('representation_status', 'KNOWN_AGENCY');
  if (sp.ageMin) query = query.gte('age', Number(sp.ageMin));
  if (sp.ageMax) query = query.lte('age', Number(sp.ageMax));
  if (sp.minHeight) query = query.gte('height_cm', Number(sp.minHeight));
  if (sp.maxValue) query = query.lte('market_value', Number(sp.maxValue) * 1_000_000);
  if (sp.contract) query = query.lte('contract_months_remaining', Number(sp.contract));

  const sort = sp.sort ?? 'value';
  if (sort === 'value') query = query.order('market_value', { ascending: false, nullsFirst: false });
  else if (sort === 'growth') query = query.order('value_change_12m_pct', { ascending: false, nullsFirst: false });
  else if (sort === 'age') query = query.order('age', { ascending: true, nullsFirst: false });
  else if (sort === 'contract') query = query.order('contract_months_remaining', { ascending: true, nullsFirst: false });
  else query = query.order('full_name', { ascending: true });

  const { data, error } = await query.limit(100);

  const [{ data: positions }, { data: nationalities }] = await Promise.all([
    supabase.from('players').select('primary_position').not('primary_position', 'is', null),
    supabase.from('countries').select('name').order('name'),
  ]);

  const positionOptions = Array.from(
    new Set((positions ?? []).map((p) => p.primary_position).filter(Boolean) as string[]),
  ).sort();

  return (
    <AppShell eyebrow="Research" title="Players">
      <PlayerFilters
        positions={positionOptions}
        nationalities={(nationalities ?? []).map((n) => n.name)}
      />

      <div className="px-4 md:px-6 py-2 flex items-baseline justify-between">
        <p className="eyebrow">
          {error ? 'Query failed' : `${data?.length ?? 0} player${data?.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="surface mx-4 md:mx-6 overflow-hidden">
        {error ? (
          <div className="px-4 py-10 text-center">
            <p className="font-semibold text-sm" style={{ color: 'var(--color-conflict)' }}>
              Could not load players
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{error.message}</p>
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold text-sm">No players match these filters</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Widen the age range or clear the agency filter to see more.
            </p>
          </div>
        ) : (
          (data as PlayerRowData[]).map((p) => <PlayerRow key={p.player_id} player={p} />)
        )}
      </div>
    </AppShell>
  );
}
