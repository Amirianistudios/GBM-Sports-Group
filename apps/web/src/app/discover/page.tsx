import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerCard, PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { cachedPlayerColumns, dobCutoff, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';
import { MARKET_REGIONS, ALL_TARGET_COUNTRIES, marketCountries } from '@/lib/markets';

export const dynamic = 'force-dynamic';

/**
 * DISCOVER — who should GBM look at.
 *
 * Not "who is most expensive": every section is ordered by the GBM
 * opportunity model (age, target markets, realistic values, minutes,
 * contract windows — the score's factors are written into each player's
 * profile). The market chips narrow everything to one region of the
 * agency's primary markets. All queries run on indexed cached columns,
 * so this page stays fast at any population size.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  const { market } = await searchParams;
  const regionCountries = marketCountries(market);
  const supabase = await createClient();

  function base(filterMarkets: boolean) {
    const countries = regionCountries ?? (filterMarkets ? ALL_TARGET_COUNTRIES : null);
    let q = supabase
      .from('players')
      .select(cachedPlayerColumns(countries !== null))
      .order('cached_opportunity', { ascending: false, nullsFirst: false });
    if (countries) q = q.in('nationality.name', countries);
    return q;
  }

  // Each section over-fetches so that, after removing everyone shown above it,
  // it can still fill its own slots. Without this the page repeats itself: the
  // opportunity model rewards youth and low valuations, so the best players
  // overall are largely the same names as the best young, inexpensive ones.
  const [top, emerging, contractWindow, newest] = await Promise.all([
    base(false).limit(12),
    base(false)
      .gte('date_of_birth', dobCutoff(24))
      .or('cached_market_value.lte.5000000,cached_market_value.is.null')
      .limit(36),
    base(false)
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(18))
      .gte('date_of_birth', dobCutoff(30))
      .limit(32),
    supabase
      .from('players')
      .select(cachedPlayerColumns(true))
      .in('nationality.name', regionCountries ?? ALL_TARGET_COUNTRIES)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const cards = (rows: typeof top): PlayerCardData[] =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rows.data ?? []) as any[]).map(fromCachedPlayer);

  // A failed query must not read as "no such players": say so, and say which.
  for (const [name, r] of [
    ['top', top], ['emerging', emerging], ['contract', contractWindow], ['newest', newest],
  ] as const) {
    if (r.error) console.error(`[discover] ${name} query failed — ${r.error.message}`);
  }

  const shown = new Set<string>();
  /** Takes the first `n` players this page has not already displayed. */
  const fresh = (rows: PlayerCardData[], n: number): PlayerCardData[] => {
    const picked: PlayerCardData[] = [];
    for (const p of rows) {
      if (shown.has(p.player_id)) continue;
      shown.add(p.player_id);
      picked.push(p);
      if (picked.length === n) break;
    }
    return picked;
  };

  const topCards = fresh(cards(top), 12);
  const emergingCards = fresh(cards(emerging), 12);
  const contractRows = fresh(cards(contractWindow), 8);
  // "New in GBM markets" is ordered by arrival, not by fit — a player already
  // shown above is still news, so this section keeps its own list.
  const newestRows = cards(newest).slice(0, 8);

  return (
    <AppShell eyebrow="Intelligence" title="Discover">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Ranked by the GBM opportunity model — age, target markets, realistic values, minutes and
        contract windows. Every score explains itself on the player&#8217;s profile.
      </p>

      {/* Market chips — one region of the agency's primary markets. */}
      <div className="px-4 md:px-6 mt-3 flex gap-1.5 flex-wrap">
        <MarketChip href="/discover" label="All markets" active={!regionCountries} />
        {Object.entries(MARKET_REGIONS).map(([key, r]) => (
          <MarketChip
            key={key}
            href={`/discover?market=${key}`}
            label={r.label}
            active={market === key}
          />
        ))}
      </div>

      <Block
        title="Top opportunities"
        subtitle="Highest GBM fit right now"
      >
        {topCards.length === 0 ? (
          <EmptyNote />
        ) : (
          <div className="player-grid px-4 md:px-6">
            {topCards.map((p, i) => (
              <PlayerCard key={p.player_id} player={p} priority={i < 4} />
            ))}
          </div>
        )}
      </Block>

      <Block
        title="Emerging talent"
        subtitle="More under-24s at €5m or less, beyond those above"
      >
        {emergingCards.length === 0 ? (
          <EmptyNote />
        ) : (
          <div className="player-grid px-4 md:px-6">
            {emergingCards.map((p) => (
              <PlayerCard key={p.player_id} player={p} />
            ))}
          </div>
        )}
      </Block>

      <Block title="Contract window closing" subtitle="Further under-30s inside the final 18 months">
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {contractRows.length === 0 ? (
            <EmptyNote inset />
          ) : (
            contractRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)
          )}
        </div>
      </Block>

      <Block title="New in GBM markets" subtitle="Most recently added target-market players">
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {newestRows.length === 0 ? (
            <EmptyNote inset />
          ) : (
            newestRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)
          )}
        </div>
      </Block>

      <div className="px-4 md:px-6 mt-5">
        <Link
          href="/players"
          className="block surface px-4 py-3 text-sm font-semibold text-center"
          style={{ color: 'var(--color-verified-2)' }}
        >
          Open the full database with filters →
        </Link>
      </div>

      <div className="h-8" />
    </AppShell>
  );
}

function MarketChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-full text-xs font-semibold"
      style={
        active
          ? { background: 'var(--fg)', color: 'var(--bg)', border: '1px solid var(--fg)' }
          : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }
      }
    >
      {label}
    </Link>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="px-4 md:px-6 mb-2">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ inset = false }: { inset?: boolean }) {
  return (
    <p className={`text-sm ${inset ? 'px-4 py-6' : 'px-4 md:px-6 py-6'}`} style={{ color: 'var(--muted)' }}>
      Nothing in this market yet — the population grows as target-market imports land.
    </p>
  );
}
