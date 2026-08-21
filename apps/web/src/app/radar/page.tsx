import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerListRow, type PlayerCardData } from '@/components/player-card';
import { PlayerPhoto } from '@/components/player-photo';
import { statusLabel } from '@/lib/format';
import { cachedPlayerColumns, dobCutoff, fromCachedPlayer, monthsAhead, todayIso } from '@/lib/card-data';

export const dynamic = 'force-dynamic';

/**
 * MARKET RADAR — opportunities and movement, not another search page.
 * Players is the broad searchable database; Radar surfaces what the current
 * production data says is MOVING: rapid growth, declines, U21 risers,
 * closing contract windows and lower-value emerging profiles. Every list is
 * a live indexed query on the cached player columns — nothing is scored or
 * invented beyond the deterministic signals the pipeline already computes.
 */
export default async function RadarPage() {
  const supabase = await createClient();

  // Every list runs on the indexed cached columns — Radar answers "what
  // moved" in milliseconds regardless of population size.
  const cols = cachedPlayerColumns(false);
  const [risersQ, declinersQ, u21RisersQ, contractWindowQ, emergingQ, { data: signals }] =
    await Promise.all([
      supabase
        .from('players')
        .select(cols)
        .gt('cached_value_change_pct', 0)
        .gte('cached_season_minutes', 450)
        .order('cached_value_change_pct', { ascending: false })
        .limit(8),
      supabase
        .from('players')
        .select(cols)
        .lt('cached_value_change_pct', 0)
        .gte('cached_market_value', 1_000_000)
        .order('cached_value_change_pct', { ascending: true })
        .limit(8),
      supabase
        .from('players')
        .select(cols)
        .gte('date_of_birth', dobCutoff(22))
        .gt('cached_value_change_pct', 0)
        .order('cached_value_change_pct', { ascending: false })
        .limit(8),
      supabase
        .from('players')
        .select(cols)
        .gte('cached_contract_expires', todayIso())
        .lte('cached_contract_expires', monthsAhead(18))
        .gte('cached_market_value', 2_000_000)
        .order('cached_contract_expires', { ascending: true })
        .limit(8),
      supabase
        .from('players')
        .select(cols)
        .gte('date_of_birth', dobCutoff(24))
        .lte('cached_market_value', 5_000_000)
        .gte('cached_season_minutes', 1800)
        .order('cached_season_minutes', { ascending: false })
        .limit(8),
      supabase
        .from('discovery_signals')
        .select('id, signal_type, score, rationale, player_id, players(full_name, image_url)')
        .eq('is_current', true)
        .neq('signal_type', 'GBM_OPPORTUNITY')
        .order('score', { ascending: false })
        .limit(6),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (r: { data: unknown }) => ((r.data ?? []) as any[]).map(fromCachedPlayer);
  const risers = rows(risersQ);
  const decliners = rows(declinersQ);
  const u21Risers = rows(u21RisersQ);
  const contractWindow = rows(contractWindowQ);
  const emerging = rows(emergingQ);

  return (
    <AppShell eyebrow="Intelligence" title="Market Radar">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Movement in the tracked market. Twelve-month value changes come from recorded valuations;
        signals are computed deterministically by the data pipeline. Use Players for broad search —
        Radar is for what changed.
      </p>

      <RadarSection
        title="Rapid value growth"
        subtitle="Strongest 12-month rises, 450+ minutes this season"
        href="/players?sort=growth"
        players={risers}
        empty="No positive value trends recorded."
      />

      <RadarSection
        title="U21 risers"
        subtitle="Under-21s with rising value"
        href="/players?ageMax=21&sort=growth"
        players={u21Risers}
        empty="No U21 value rises recorded."
      />

      <RadarSection
        title="Contract window closing"
        subtitle="€2m+ players inside 18 months of expiry"
        href="/players?contract=18&sort=value"
        players={contractWindow}
        empty="No expiring contracts recorded."
      />

      <RadarSection
        title="Emerging at low value"
        subtitle="≤23 years, ≤€5m, 1,800+ minutes — playing more than their price"
        href="/players?ageMax=23&maxValue=5&minMinutes=1800&sort=minutes"
        players={emerging}
        empty="No emerging low-value profiles above the minutes floor."
      />

      <RadarSection
        title="Value declines"
        subtitle="Falling valuations — context required before conclusions"
        href="/players?sort=growth"
        players={decliners}
        empty="No negative value trends recorded."
      />

      {(signals ?? []).length > 0 && (
        <section className="px-4 md:px-6 mt-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <div>
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">Unusual development signals</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Computed by the pipeline, with the reasoning shown</p>
            </div>
            <Link href="/discover" className="text-xs font-semibold" style={{ color: 'var(--color-verified-2)' }}>
              View all
            </Link>
          </div>
          <div className="card overflow-hidden">
            {(signals ?? []).map((s) => {
              const p = Array.isArray(s.players) ? s.players[0] : s.players;
              return (
                <Link key={s.id} href={`/players/${s.player_id}`} className="sheet-row">
                  <div className="flex items-center gap-3">
                    <PlayerPhoto src={p?.image_url ?? null} name={p?.full_name ?? '—'} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[0.9375rem]">{p?.full_name}</span>
                        <span className="badge badge-neutral">{statusLabel(s.signal_type)}</span>
                      </div>
                      {s.rationale && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{s.rationale}</p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="h-8" />
    </AppShell>
  );
}

function RadarSection({
  title,
  subtitle,
  href,
  players,
  empty,
}: {
  title: string;
  subtitle: string;
  href: string;
  players: PlayerCardData[];
  empty: string;
}) {
  return (
    <section className="px-4 md:px-6 mt-5">
      <div className="flex items-baseline justify-between mb-1.5">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        </div>
        <Link href={href} className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-verified-2)' }}>
          View all
        </Link>
      </div>
      <div className="card overflow-hidden">
        {players.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--muted)' }}>{empty}</p>
        ) : (
          players.map((p) => <PlayerListRow key={p.player_id} player={p} />)
        )}
      </div>
    </section>
  );
}
