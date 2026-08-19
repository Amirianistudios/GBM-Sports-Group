import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerRow, type PlayerRowData } from '@/components/player-row';
import { formatCurrency } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Clock reads live outside the component body. The page is force-dynamic, so
 * every request genuinely re-evaluates these — but React's purity rule (rightly)
 * refuses to see `Date.now()` inline in a component, since that is how stale
 * prerenders and hydration mismatches happen.
 */
const CONTRACT_HORIZON_DAYS = 547; // 18 months

function contractHorizonDate(): string {
  return new Date(Date.now() + CONTRACT_HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
}

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * GBM DAILY INTELLIGENCE FEED.
 * The premise: the platform should be useful when nobody is searching.
 * Every tile is a live count, and every count is a link into the work.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: playerCount },
    { count: providerCount },
    { data: repOpps },
    { data: signals },
    { count: expiringCount },
    { count: noAgencyCount },
  ] = await Promise.all([
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('data_providers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('v_representation_opportunities')
      .select('*')
      .eq('representation_status', 'NO_AGENCY_LISTED')
      .gte('age', 15)
      .lte('age', 23)
      .order('value_change_12m_pct', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('discovery_signals')
      .select('id, signal_type, score, rationale, player_id, players(full_name)')
      .eq('is_current', true)
      .order('score', { ascending: false })
      .limit(6),
    supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .lte('expires_on', contractHorizonDate()),
    supabase
      .from('representation_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'NO_AGENCY_LISTED')
      .eq('is_current', true),
  ]);

  const greeting = greetingForNow();

  const tiles = [
    { label: 'Players tracked', value: playerCount ?? 0, href: '/players' },
    { label: 'No agency listed', value: noAgencyCount ?? 0, href: '/representation' },
    { label: 'Contracts ≤18 months', value: expiringCount ?? 0, href: '/players?contract=18' },
    { label: 'Active providers', value: providerCount ?? 0, href: '/data' },
  ];

  return (
    <AppShell eyebrow={greeting} title="Intelligence feed">
      <section className="px-4 md:px-6 pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="surface p-3 block">
              <div className="data text-2xl font-semibold leading-none">{t.value}</div>
              <div className="eyebrow mt-2">{t.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="px-4 md:px-6 flex items-baseline justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Representation research queue</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Aged 15–23, source lists no agency
            </p>
          </div>
          <Link href="/representation" className="text-xs font-semibold" style={{ color: 'var(--color-verified-2)' }}>
            View all
          </Link>
        </div>

        {/* The single most important caveat in this product. */}
        <div
          className="mx-4 md:mx-6 mb-2 px-3 py-2 text-xs leading-relaxed rounded-[3px]"
          style={{
            background: 'color-mix(in srgb, var(--color-attention) 12%, transparent)',
            color: 'var(--color-attention-2)',
            border: '1px solid color-mix(in srgb, var(--color-attention) 28%, transparent)',
          }}
        >
          <strong>Unverified.</strong> “No agency listed” records what the source displayed. It is not
          evidence a player is unrepresented — many of these players do have representation. Verify
          before any approach.
        </div>

        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {(repOpps ?? []).length === 0 ? (
            <EmptyState
              title="Nothing in the queue"
              body="Once a representation sync has run, players whose source shows no agency appear here."
            />
          ) : (
            (repOpps as PlayerRowData[]).map((p) => <PlayerRow key={p.player_id} player={p} />)
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="px-4 md:px-6 mb-2">
          <h2 className="text-base font-semibold tracking-tight">Discovery signals</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Computed from market value trend and representation state
          </p>
        </div>

        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {(signals ?? []).length === 0 ? (
            <EmptyState
              title="No signals computed yet"
              body="Run the discovery signal job to populate this feed."
            />
          ) : (
            (signals ?? []).map((s) => {
              const player = Array.isArray(s.players) ? s.players[0] : s.players;
              return (
                <Link key={s.id} href={`/players/${s.player_id}`} className="sheet-row">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[0.9375rem]">
                          {player?.full_name ?? 'Unknown player'}
                        </span>
                        <span className="badge badge-neutral">
                          {s.signal_type.replaceAll('_', ' ').toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                        {s.rationale}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <p className="px-4 md:px-6 mt-8 text-xs" style={{ color: 'var(--muted)' }}>
        Data shown is a controlled sample loaded from the Transfermarkt open dataset. Connect Wyscout
        credentials to add professional match and statistical data.
      </p>
    </AppShell>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
    </div>
  );
}
