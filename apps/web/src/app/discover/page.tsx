import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerCard, PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { cachedPlayerColumns, dobCutoff, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';
import { MARKET_REGIONS, ALL_TARGET_COUNTRIES, marketCountries } from '@/lib/markets';
import { getTranslator } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * DISCOVER — who should GBM look at.
 *
 * Not "who is most expensive": every section is ordered by the GBM
 * opportunity model, and every section respects the same market scope. The
 * default is the agency's target markets — the earlier version scoped only
 * its fourth section and claimed otherwise in its intro; "Everywhere" now
 * exists as an explicit, honest choice rather than a silent default.
 *
 * All queries run on indexed cached columns, so this page stays fast at any
 * population size.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  const { market } = await searchParams;
  const { t } = await getTranslator();
  const everywhere = market === 'all';
  const regionCountries = marketCountries(market);
  const countries = everywhere ? null : (regionCountries ?? ALL_TARGET_COUNTRIES);
  const supabase = await createClient();

  function base() {
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
    base().limit(12),
    base()
      .gte('date_of_birth', dobCutoff(24))
      .or('cached_market_value.lte.5000000,cached_market_value.is.null')
      .limit(36),
    base()
      .gte('cached_contract_expires', todayIso())
      .lte('cached_contract_expires', monthsAhead(18))
      .gte('date_of_birth', dobCutoff(30))
      .limit(32),
    supabase
      .from('players')
      .select(cachedPlayerColumns(true))
      .in('nationality.name', countries ?? ALL_TARGET_COUNTRIES)
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

  /** Saved starting points in the full database, market scope carried along. */
  const PRESETS: Array<{ label: string; href: string }> = [
    { label: t('discover.preset.u21'), href: '/players?ageMax=21&sort=growth&minMinutes=450' },
    { label: t('discover.preset.contract'), href: '/players?contract=12&ageMax=28&sort=contract' },
    { label: t('discover.preset.noagency'), href: '/players?agency=none&ageMax=23&sort=fit' },
    { label: t('discover.preset.minutes'), href: '/players?ageMax=23&minMinutes=900&sort=minutes' },
  ];

  const empty = t('discover.empty');

  return (
    <AppShell eyebrow={t('nav.group.intelligence')} title={t('nav.discover')}>
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        {t('discover.intro')}
      </p>

      {/* Market scope — GBM's target markets by default, one region, or all. */}
      <div className="px-4 md:px-6 mt-3 flex gap-1.5 flex-wrap">
        <MarketChip href="/discover" label={t('discover.markets.gbm')} active={!everywhere && !regionCountries} />
        {Object.entries(MARKET_REGIONS).map(([key, r]) => (
          <MarketChip
            key={key}
            href={`/discover?market=${key}`}
            label={r.label}
            active={market === key}
          />
        ))}
        <MarketChip href="/discover?market=all" label={t('discover.markets.all')} active={everywhere} />
      </div>

      {/* Presets: one tap from a question to a filtered, sorted answer. */}
      <div className="px-4 md:px-6 mt-3">
        <p className="eyebrow mb-1.5">{t('discover.presets')}</p>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="inline-flex items-center px-3 min-h-[38px] rounded-[5px] text-xs font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--color-gbm) 9%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--color-gbm) 35%, var(--border))',
                color: 'var(--color-gbm-2)',
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <Block title={t('discover.top')} subtitle={t('discover.top.sub')}>
        {topCards.length === 0 ? (
          <EmptyNote text={empty} />
        ) : (
          <div className="player-grid px-4 md:px-6">
            {topCards.map((p, i) => (
              <PlayerCard key={p.player_id} player={p} priority={i < 4} />
            ))}
          </div>
        )}
      </Block>

      <Block title={t('discover.emerging')} subtitle={t('discover.emerging.sub')}>
        {emergingCards.length === 0 ? (
          <EmptyNote text={empty} />
        ) : (
          <div className="player-grid px-4 md:px-6">
            {emergingCards.map((p) => (
              <PlayerCard key={p.player_id} player={p} />
            ))}
          </div>
        )}
      </Block>

      <Block title={t('discover.contract')} subtitle={t('discover.contract.sub')}>
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {contractRows.length === 0 ? (
            <EmptyNote text={empty} inset />
          ) : (
            contractRows.map((p) => <PlayerListRow key={p.player_id} player={p} />)
          )}
        </div>
      </Block>

      <Block title={t('discover.newest')} subtitle={t('discover.newest.sub')}>
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {newestRows.length === 0 ? (
            <EmptyNote text={empty} inset />
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
          {t('discover.openAll')}
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
      className="inline-flex items-center px-3.5 min-h-[38px] rounded-full text-xs font-semibold"
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

function EmptyNote({ text, inset = false }: { text: string; inset?: boolean }) {
  return (
    <p className={`text-sm ${inset ? 'px-4 py-6' : 'px-4 md:px-6 py-6'}`} style={{ color: 'var(--muted)' }}>
      {text}
    </p>
  );
}
