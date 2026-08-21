import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerCard, PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { PlayerFilters } from '@/components/player-filters';
import { Pagination } from '@/components/pagination';
import { ViewToggle } from '@/components/view-toggle';
import { cachedPlayerColumns, dobCutoff, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | undefined>>;

type Foot = 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN';
const FOOT_VALUES: Foot[] = ['LEFT', 'RIGHT', 'BOTH', 'UNKNOWN'];

const PAGE_SIZE = 48;

/**
 * PLAYER DISCOVERY.
 * Reads v_player_discovery: one row per player carrying identity, value,
 * representation, current-season counting statistics, per-90 rates and the
 * strongest current signal. Advanced-metric filters appear only when a
 * licensed provider supplies the columns — nothing here is derived from data
 * the platform does not hold.
 *
 * Pagination fetches PAGE_SIZE + 1 rows: "next page exists" without paying a
 * full-view COUNT, which on a computed view costs as much as the page.
 */
export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const sort = sp.sort ?? 'fit';

  // Two query paths. The fast path sorts and filters on the indexed cached
  // columns of `players` (milliseconds at any population size). Filters and
  // sorts that need representation state or per-90 statistics fall back to
  // the discovery view — rarer, and still inside the timeout since 0014.
  const needsView =
    Boolean(sp.agency || sp.minApps || sp.minGoals || sp.minAssists || sp.minG90 || sp.minA90) ||
    ['signal', 'goals', 'g90', 'a90'].includes(sort);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any;

  if (needsView) {
    query = supabase.from('v_player_discovery').select('*');

    if (sp.q) query = query.ilike('full_name', `%${sp.q}%`);
    if (sp.position) query = query.eq('primary_position', sp.position);
    if (sp.nationality) query = query.eq('nationality', sp.nationality);
    if (sp.league) query = query.eq('league_name', sp.league);
    if (sp.foot && FOOT_VALUES.includes(sp.foot as Foot)) query = query.eq('foot', sp.foot as Foot);
    if (sp.agency === 'none') query = query.eq('representation_status', 'NO_AGENCY_LISTED');
    if (sp.agency === 'known') query = query.eq('representation_status', 'KNOWN_AGENCY');
    if (sp.ageMin) query = query.gte('age', Number(sp.ageMin));
    if (sp.ageMax) query = query.lte('age', Number(sp.ageMax));
    if (sp.minHeight) query = query.gte('height_cm', Number(sp.minHeight));
    if (sp.maxValue) query = query.lte('market_value', Number(sp.maxValue) * 1_000_000);
    if (sp.contract) query = query.lte('contract_months_remaining', Number(sp.contract));
    if (sp.minMinutes) query = query.gte('season_minutes', Number(sp.minMinutes));
    if (sp.minApps) query = query.gte('season_apps', Number(sp.minApps));
    if (sp.minGoals) query = query.gte('season_goals', Number(sp.minGoals));
    if (sp.minAssists) query = query.gte('season_assists', Number(sp.minAssists));
    if (sp.minG90) query = query.gte('goals_per90', Number(sp.minG90));
    if (sp.minA90) query = query.gte('assists_per90', Number(sp.minA90));

    if (sort === 'value') query = query.order('market_value', { ascending: false, nullsFirst: false });
    else if (sort === 'lowvalue') query = query.order('market_value', { ascending: true, nullsFirst: false });
    else if (sort === 'growth') query = query.order('value_change_12m_pct', { ascending: false, nullsFirst: false });
    else if (sort === 'fit') query = query.order('gbm_opportunity', { ascending: false, nullsFirst: false });
    else if (sort === 'signal') query = query.order('top_signal_score', { ascending: false, nullsFirst: false });
    else if (sort === 'minutes') query = query.order('season_minutes', { ascending: false, nullsFirst: false });
    else if (sort === 'goals') query = query.order('season_goals', { ascending: false, nullsFirst: false });
    else if (sort === 'g90') query = query.order('goals_per90', { ascending: false, nullsFirst: false });
    else if (sort === 'a90') query = query.order('assists_per90', { ascending: false, nullsFirst: false });
    else if (sort === 'age') query = query.order('age', { ascending: true, nullsFirst: false });
    else if (sort === 'contract') query = query.order('contract_months_remaining', { ascending: true, nullsFirst: false });
    else if (sort === 'recent') query = query.order('added_at', { ascending: false });
    else query = query.order('full_name', { ascending: true });
  } else {
    query = supabase.from('players').select(cachedPlayerColumns(Boolean(sp.nationality)));

    if (sp.q) query = query.ilike('full_name', `%${sp.q}%`);
    if (sp.position) query = query.eq('primary_position', sp.position);
    if (sp.nationality) query = query.eq('nationality.name', sp.nationality);
    if (sp.league) query = query.eq('cached_league', sp.league);
    if (sp.foot && FOOT_VALUES.includes(sp.foot as Foot)) query = query.eq('foot', sp.foot as Foot);
    // age N or older = born on/before the cutoff N years back.
    if (sp.ageMin) query = query.lte('date_of_birth', dobCutoff(Number(sp.ageMin)));
    if (sp.ageMax) query = query.gte('date_of_birth', dobCutoff(Number(sp.ageMax) + 1));
    if (sp.minHeight) query = query.gte('height_cm', Number(sp.minHeight));
    if (sp.maxValue) query = query.lte('cached_market_value', Number(sp.maxValue) * 1_000_000);
    if (sp.contract) {
      query = query
        .gte('cached_contract_expires', todayIso())
        .lte('cached_contract_expires', monthsAhead(Number(sp.contract)));
    }
    if (sp.minMinutes) query = query.gte('cached_season_minutes', Number(sp.minMinutes));

    if (sort === 'value') query = query.order('cached_market_value', { ascending: false, nullsFirst: false });
    else if (sort === 'lowvalue') query = query.order('cached_market_value', { ascending: true, nullsFirst: false });
    else if (sort === 'growth') query = query.order('cached_value_change_pct', { ascending: false, nullsFirst: false });
    else if (sort === 'fit') query = query.order('cached_opportunity', { ascending: false, nullsFirst: false });
    else if (sort === 'minutes') query = query.order('cached_season_minutes', { ascending: false, nullsFirst: false });
    else if (sort === 'age') query = query.order('date_of_birth', { ascending: false, nullsFirst: false });
    else if (sort === 'contract') query = query.order('cached_contract_expires', { ascending: true, nullsFirst: false });
    else if (sort === 'recent') query = query.order('created_at', { ascending: false });
    else query = query.order('full_name', { ascending: true });
  }

  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  // Filter options come from tables, not from evaluating the discovery view:
  // positions from players, countries from the reference table, leagues from
  // the dedicated options view — all millisecond queries.
  const [{ data, error }, { data: positions }, { data: nationalities }, { data: leagueRows }] =
    await Promise.all([
      query.range(from, from + PAGE_SIZE),
      supabase.from('players').select('primary_position').not('primary_position', 'is', null),
      supabase.from('countries').select('name').order('name'),
      supabase.from('v_league_options').select('league_name').order('league_name'),
    ]);

  const hasNext = (data?.length ?? 0) > PAGE_SIZE;
  const players = (
    needsView
      ? ((data ?? []) as PlayerCardData[])
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((data ?? []) as any[]).map(fromCachedPlayer)
  ).slice(0, PAGE_SIZE);
  const view = sp.view === 'grid' ? 'grid' : 'list';

  const positionOptions = Array.from(
    new Set((positions ?? []).map((p) => p.primary_position).filter(Boolean) as string[]),
  ).sort();
  const leagueOptions = ((leagueRows ?? []).map((l) => l.league_name).filter(Boolean) as string[]);

  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'page') params.set(k, v);
    if (p > 1) params.set('page', String(p));
    return `/players${params.size ? `?${params}` : ''}`;
  };

  return (
    <AppShell eyebrow="Scouting" title="Players" action={<ViewToggle />}>
      <PlayerFilters
        positions={positionOptions}
        nationalities={(nationalities ?? []).map((n) => n.name)}
        leagues={leagueOptions}
      />

      <div className="px-4 md:px-6 py-2 flex items-baseline justify-between">
        <p className="eyebrow">
          {error
            ? 'Query failed'
            : `${players.length}${hasNext ? '+' : ''} player${players.length === 1 ? '' : 's'}${page > 1 ? ` · page ${page}` : ''}`}
        </p>
        <p className="eyebrow hidden sm:block">
          {sort === 'fit' ? 'Ranked by GBM opportunity model' : 'Counting statistics from the connected dataset'}
        </p>
      </div>

      {error ? (
        <div className="surface mx-4 md:mx-6 px-4 py-10 text-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--color-conflict)' }}>
            Could not load players
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{error.message}</p>
        </div>
      ) : players.length === 0 ? (
        <div className="surface mx-4 md:mx-6 px-4 py-12 text-center">
          <p className="font-semibold text-sm">No players match these filters</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Widen the age range or lower the statistical floors to see more.
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="player-grid px-4 md:px-6">
          {players.map((p, i) => (
            <PlayerCard key={p.player_id} player={p} priority={i < 6} />
          ))}
        </div>
      ) : (
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {players.map((p) => (
            <PlayerListRow key={p.player_id} player={p} />
          ))}
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} makeHref={makeHref} />

      <p className="px-4 md:px-6 mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Statistical filters cover counting statistics from the connected dataset. Defensive and
        possession metrics (duels, interceptions, xG…) appear when a licensed statistics provider is
        connected — they are never derived or estimated.
      </p>
      <div className="h-8" />
    </AppShell>
  );
}
