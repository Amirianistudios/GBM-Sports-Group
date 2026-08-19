import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ValueChart } from '@/components/value-chart';
import { SourceStripe, ProvenanceBadge } from '@/components/source-stripe';
import { WatchlistButton } from '@/components/watchlist-button';
import {
  formatAge, formatCurrency, formatDate, footLabel, monthsUntil, positionCode,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

/** External profile links, so a scout never has to Google a player. */
const PROVIDER_LABELS: Record<string, string> = {
  WYSCOUT: 'Wyscout',
  TRANSFERMARKT: 'Transfermarkt',
  TRANSFERMARKT_DATASET: 'Transfermarkt',
  SOFASCORE: 'Sofascore',
  FOTMOB: 'FotMob',
  BESOCCER: 'BeSoccer',
  SPORTDB: 'SportDB',
  REEP: 'Reep',
  FBREF: 'FBref',
};

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('*, clubs(name, city), nationality:countries!players_nationality_country_id_fkey(name), birth_country:countries!players_birth_country_id_fkey(name)')
    .eq('id', id)
    .maybeSingle();

  if (!player) notFound();

  const [
    { data: externalIds },
    { data: marketValues },
    { data: contract },
    { data: representation },
    { data: transfers },
    { data: facts },
    { data: conflicts },
    { data: signals },
    { data: coverage },
  ] = await Promise.all([
    supabase.from('player_external_ids').select('*').eq('player_id', id),
    supabase.from('market_values').select('valued_on, value_amount, provider_code').eq('player_id', id).order('valued_on'),
    supabase.from('contracts').select('*').eq('player_id', id).maybeSingle(),
    supabase.from('v_player_representation').select('*').eq('player_id', id).maybeSingle(),
    supabase.from('transfers').select('*').eq('player_id', id).order('transfer_date', { ascending: false }),
    supabase.from('source_facts').select('*').eq('entity_id', id).eq('is_current', true),
    supabase.from('player_fact_conflicts').select('*').eq('player_id', id),
    supabase.from('discovery_signals').select('*').eq('player_id', id).eq('is_current', true).order('score', { ascending: false }),
    supabase.from('v_player_source_coverage').select('*').eq('player_id', id).maybeSingle(),
  ]);

  const club = Array.isArray(player.clubs) ? player.clubs[0] : player.clubs;
  const nationality = Array.isArray(player.nationality) ? player.nationality[0] : player.nationality;
  const providerCount = coverage?.provider_count ?? 0;
  const conflictKeys = new Set((conflicts ?? []).map((c) => c.fact_key));

  const factSources = (key: string) =>
    (facts ?? []).filter((f) => f.fact_key === key).length;

  const contractMonths = monthsUntil(contract?.expires_on);

  return (
    <AppShell eyebrow="Player" title={player.full_name}>
      {/* ---------------------------------------------------------------- */}
      {/* HEADER                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-4 md:px-6 pt-2">
        <div className="surface p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold tracking-tight leading-tight">{player.full_name}</h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                <span className="pos-chip">
                  {positionCode(player.primary_position)}
                  <span aria-hidden="true">·</span>
                  <span className="data">{formatAge(player.date_of_birth)}y</span>
                </span>
                <span>{club?.name ?? 'Club unknown'}</span>
                {nationality?.name && <><span aria-hidden="true">·</span><span>{nationality.name}</span></>}
              </div>
            </div>
            <WatchlistButton playerId={id} />
          </div>

          <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Fact label="Born" value={formatDate(player.date_of_birth)} sources={factSources('player.date_of_birth')} conflict={conflictKeys.has('player.date_of_birth')} />
            <Fact label="Height" value={player.height_cm ? `${player.height_cm} cm` : '—'} sources={factSources('player.height_cm')} conflict={conflictKeys.has('player.height_cm')} />
            <Fact label="Foot" value={footLabel(player.foot)} sources={0} />
            <Fact label="Position" value={player.primary_position ?? '—'} sources={factSources('player.primary_position')} conflict={conflictKeys.has('player.primary_position')} />
            <Fact label="Sources" value={String(providerCount)} sources={0} />
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* REPRESENTATION — the GBM-specific module                          */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Representation">
        <div className="p-4">
          {!representation ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No representation record. This player has not been checked yet.
            </p>
          ) : representation.status === 'KNOWN_AGENCY' ? (
            <>
              <p className="eyebrow">Agency listed</p>
              <p className="text-lg font-semibold mt-0.5">{representation.agency_name}</p>
            </>
          ) : representation.status === 'NO_AGENCY_LISTED' ? (
            <>
              <div className="flex items-center gap-2">
                <ProvenanceBadge state="single">No agency listed</ProvenanceBadge>
              </div>
              {/* The most important sentence in the product. */}
              <p className="text-sm mt-2 leading-relaxed">
                {PROVIDER_LABELS[representation.primary_provider ?? ''] ?? representation.primary_provider}{' '}
                displays no agency for this player.{' '}
                <strong>This is not evidence that the player is unrepresented.</strong>{' '}
                Verify independently before any approach.
              </p>
            </>
          ) : (
            <ProvenanceBadge state="conflict">Sources disagree on representation</ProvenanceBadge>
          )}

          {representation && (
            <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
              Last checked {formatDate(representation.last_checked_at)} ·{' '}
              {representation.source_count} source{representation.source_count === 1 ? '' : 's'}
              {representation.source_url && (
                <>
                  {' · '}
                  <a href={representation.source_url} target="_blank" rel="noopener noreferrer"
                     className="underline" style={{ color: 'var(--color-verified-2)' }}>
                    View source
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* MARKET VALUE                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Market value" subtitle={`${marketValues?.length ?? 0} valuations`}>
        <ValueChart points={(marketValues ?? []).map((m) => ({ valued_on: m.valued_on, value_amount: Number(m.value_amount) }))} />
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* CONTRACT                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Contract">
        <div className="p-4 flex items-baseline gap-4">
          <div>
            <p className="eyebrow">Expires</p>
            <p className="data text-lg font-semibold mt-0.5">{formatDate(contract?.expires_on)}</p>
          </div>
          {contractMonths !== null && (
            <div>
              <p className="eyebrow">Remaining</p>
              <p className="data text-lg font-semibold mt-0.5">
                {contractMonths} mo
                {contractMonths <= 18 && (
                  <span className="ml-2 badge badge-attention align-middle">Entering final window</span>
                )}
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* DISCOVERY SIGNALS                                                 */}
      {/* ---------------------------------------------------------------- */}
      {(signals ?? []).length > 0 && (
        <Section title="Discovery signals">
          {(signals ?? []).map((s) => (
            <div key={s.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="badge badge-neutral">{s.signal_type.replaceAll('_', ' ').toLowerCase()}</span>
                <span className="data text-xs" style={{ color: 'var(--muted)' }}>score {Number(s.score).toFixed(1)}</span>
              </div>
              <p className="text-sm mt-1.5 leading-relaxed">{s.rationale}</p>
            </div>
          ))}
        </Section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TRANSFERS                                                         */}
      {/* ---------------------------------------------------------------- */}
      {(transfers ?? []).length > 0 && (
        <Section title="Transfer history">
          {(transfers ?? []).map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span style={{ color: 'var(--muted)' }}>{t.from_club_name_raw ?? '—'}</span>
                  <span className="mx-1.5" aria-hidden="true">→</span>
                  <span className="font-semibold">{t.to_club_name_raw ?? '—'}</span>
                </p>
                <p className="data text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {formatDate(t.transfer_date)} {t.season_name ? `· ${t.season_name}` : ''}
                </p>
              </div>
              <span className="data text-sm font-semibold shrink-0">
                {t.is_free ? 'Free' : formatCurrency(t.fee_amount ? Number(t.fee_amount) : null)}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* SOURCES & EXTERNAL LINKS                                          */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Sources" subtitle={`Linked across ${providerCount} provider${providerCount === 1 ? '' : 's'}`}>
        <div className="p-4 flex flex-wrap gap-2">
          {(externalIds ?? []).map((e) => (
            <a
              key={e.id}
              href={e.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-[3px] text-sm font-semibold flex items-center gap-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              {PROVIDER_LABELS[e.provider_code] ?? e.provider_code}
              <span className="data text-xs" style={{ color: 'var(--muted)' }}>{e.external_id}</span>
              <span aria-hidden="true" style={{ color: 'var(--muted)' }}>↗</span>
            </a>
          ))}
          {(externalIds ?? []).length === 0 && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No provider identities linked yet.</p>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* DATA QUALITY                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Section title="Data quality">
        <div className="p-4">
          {(conflicts ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No conflicts detected between sources for this player.
            </p>
          ) : (
            <>
              <p className="eyebrow mb-2">Sources disagree</p>
              {(conflicts ?? []).map((c) => (
                <div key={c.fact_key} className="mb-3">
                  <p className="text-sm font-semibold">{c.fact_key}</p>
                  <ul className="mt-1 space-y-0.5">
                    {(c.sources as Array<{ provider: string; value: string }>).map((s, i) => (
                      <li key={i} className="data text-xs" style={{ color: 'var(--muted)' }}>
                        {s.provider}: {s.value}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                GBM keeps every reported value. Nothing is silently overwritten.
              </p>
            </>
          )}
        </div>
      </Section>

      <div className="h-8" />
    </AppShell>
  );
}

function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="px-4 md:px-6 mb-1.5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <span className="eyebrow">{subtitle}</span>}
      </div>
      <div className="surface mx-4 md:mx-6 overflow-hidden">{children}</div>
    </section>
  );
}

function Fact({
  label, value, sources, conflict = false,
}: { label: string; value: string; sources: number; conflict?: boolean }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="data text-sm font-semibold mt-0.5">{value}</dd>
      {sources > 0 && (
        <div className="mt-1">
          <SourceStripe sourceCount={sources} hasConflict={conflict} label={label} />
        </div>
      )}
    </div>
  );
}
