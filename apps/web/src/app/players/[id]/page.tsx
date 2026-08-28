import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ValueChart } from '@/components/value-chart';
import { SourceStripe, ProvenanceBadge } from '@/components/source-stripe';
import { WatchlistButton } from '@/components/watchlist-button';
import { SeasonStatsTable, type SeasonStatRow } from '@/components/season-stats-table';
import { AddNote } from '@/components/add-note';
import { PlayerLinks, type PlayerLink } from '@/components/player-links';
import { PlayerPhoto } from '@/components/player-photo';
import { Tabs } from '@/components/tabs';
import { countryFlag } from '@/lib/flags';
import {
  formatAge, formatCurrency, formatDate, footLabel, leagueLabel, monthsUntil,
  signalLabel, statusLabel, trend,
} from '@/lib/format';
import { buildIntelligenceSummary } from '@/lib/summary';

export const dynamic = 'force-dynamic';

/**
 * Latest valuation dated a year or more ago. The clock read lives outside
 * the component body — the page is force-dynamic, so it re-evaluates per
 * request, and React's purity rule rightly refuses Date.now() in render.
 */
/** Age in years from an ISO date of birth; null when absent or unparseable. */
function ageYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 31_557_600_000;
}

function valueOneYearAgo(
  marketValues: Array<{ valued_on: string; value_amount: number | string }>,
): number | null {
  const cut = Date.now() - 31_557_600_000;
  const past = marketValues.filter((m) => new Date(m.valued_on).getTime() <= cut);
  return past.length ? Number(past[past.length - 1].value_amount) : null;
}

/** External profile links, so a scout never has to Google a player. */
const PROVIDER_LABELS: Record<string, string> = {
  WYSCOUT: 'Wyscout',
  TRANSFERMARKT: 'Transfermarkt',
  TRANSFERMARKT_DATASET: 'Transfermarkt',
  SOFASCORE: 'Sofascore',
  FOTMOB: 'FotMob',
  BESOCCER: 'BeSoccer',
  SPORTMONKS: 'SportMonks',
  API_FOOTBALL: 'API-Football',
  STATSBOMB: 'StatsBomb',
  UNDERSTAT: 'Understat',
  SPORTDB: 'SportDB',
  REEP: 'Reep',
  FBREF: 'FBref',
  WIKIDATA: 'Wikidata',
};

/**
 * PLAYER PROFILE — a professional scouting document.
 * Header carries identity and the headline facts (traceable via the source
 * stripes); the body is tabbed: Overview / Performance / Market / Career /
 * Representation / GBM Notes. Everything renders from one server pass;
 * missing data stays visibly missing — nothing is estimated or invented.
 */
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
    { data: seasonStats },
    { data: injuries },
    { data: reports },
    { data: ratings },
    { data: notes },
    { data: links },
    { data: intelReports },
    { data: intelRecommendation },
    { data: intelAdaptation },
    { data: news },
    { data: percentiles },
  ] = await Promise.all([
    supabase.from('player_external_ids').select('*').eq('player_id', id),
    // Explicit bounds on the per-player history reads. The response cap would
    // truncate them anyway at 1,000 — these limits state the real contract
    // (a valuation curve beyond ~300 points adds pixels, not information) and
    // keep the profile's payload predictable for well-documented players.
    supabase.from('market_values').select('valued_on, value_amount, provider_code').eq('player_id', id).order('valued_on', { ascending: false }).limit(300),
    supabase.from('contracts').select('*').eq('player_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('v_player_representation').select('*').eq('player_id', id).maybeSingle(),
    supabase.from('transfers').select('*').eq('player_id', id).order('transfer_date', { ascending: false }).limit(100),
    supabase.from('source_facts').select('*').eq('entity_id', id).eq('is_current', true),
    supabase.from('player_fact_conflicts').select('*').eq('player_id', id),
    supabase.from('discovery_signals').select('*').eq('player_id', id).eq('is_current', true).order('score', { ascending: false }),
    supabase.from('v_player_source_coverage').select('*').eq('player_id', id).maybeSingle(),
    supabase
      .from('player_season_stats')
      .select('id, matches_played, minutes_played, goals, assists, yellow_cards, red_cards, seasons(name), competitions(name), clubs(name)')
      .eq('player_id', id),
    supabase.from('player_injuries').select('*').eq('player_id', id).order('started_on', { ascending: false }).limit(50),
    supabase
      .from('scouting_reports')
      .select('*')
      .eq('player_id', id)
      .order('observed_on', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase.from('scout_player_ratings').select('attribute, rating').eq('player_id', id),
    supabase
      .from('player_notes')
      .select('id, body, created_at, author_id')
      .eq('player_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('player_links').select('id, kind, url, label').eq('player_id', id).order('created_at'),

    // External AI intelligence. Read separately from `scouting_reports` and
    // rendered in its own tab: a model's assessment and a scout's observation
    // are different kinds of evidence and the interface must not blur them.
    supabase
      .from('intel_reports')
      .select('id, report_type, version, headline, summary, sections, sources, model_name, confidence, created_at, is_current')
      .eq('player_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('intel_recommendations')
      .select('recommendation, fit_label, age_profile, financial_band, playing_style, development_potential, resale_potential, rationale, confidence, created_at')
      .eq('player_id', id)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('intel_adaptation_assessments')
      .select('from_competition_name, to_competition_name, technical_gap, competition_gap, adaptation_risk, risk_score, next_step, rationale, confidence, created_at')
      .eq('player_id', id)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // News reaches this table from two directions — the hourly connectors and
    // the external AI team — so it is read here rather than inside the AI tab,
    // and each row says which one collected it.
    supabase
      .from('player_news')
      .select('id, headline, summary, source_name, source_url, source_type, category, published_at, discovered_at, reliability, impact, impact_note, agent_id')
      .eq('player_id', id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('discovered_at', { ascending: false })
      .limit(12),

    // Position intelligence: versioned cohort percentiles and the
    // performance summary. CLAUDE:% rows (the retired methodology) are
    // deliberately not read — they remain in the table as evidence only.
    supabase
      .from('player_percentiles')
      .select('metric_key, raw_value, per90_value, percentile, peer_group_size, model_version, confidence, cohort')
      .eq('player_id', id)
      .in('model_version', ['POSITION_PERCENTILE_V1', 'GBM_PERFORMANCE_V1', 'GBM_ROLE_FIT_V1'])
      .limit(200),
  ]);

  const club = Array.isArray(player.clubs) ? player.clubs[0] : player.clubs;
  const nationality = Array.isArray(player.nationality) ? player.nationality[0] : player.nationality;
  const providerCount = coverage?.provider_count ?? 0;
  const conflictKeys = new Set((conflicts ?? []).map((c) => c.fact_key));
  const flag = countryFlag(nationality?.name);

  /**
   * How many sources assert this fact — the number behind the corroboration
   * stripe. `AI_ASSESSED` rows are excluded: the external research team reads
   * the same sites the providers do, so counting its assertion as a second
   * source would turn one source into two and show corroboration that does not
   * exist. Its contribution is visible in the AI Intelligence tab, where
   * nothing is competing with it.
   */
  const factSources = (key: string) =>
    (facts ?? []).filter((f) => f.fact_key === key && f.state !== 'AI_ASSESSED').length;

  const contractMonths = monthsUntil(contract?.expires_on);
  // The query fetches newest-first so its limit keeps the RECENT 300; the
  // chart and the trend arithmetic below expect chronological order.
  const valueSeries = [...(marketValues ?? [])].sort(
    (a, b) => a.valued_on.localeCompare(b.valued_on),
  );
  const latestValue = valueSeries.length
    ? Number(valueSeries[valueSeries.length - 1].value_amount)
    : null;
  const yearAgoValue = valueOneYearAgo(valueSeries);
  const valueTrend =
    latestValue !== null && yearAgoValue !== null && yearAgoValue > 0
      ? trend(((latestValue - yearAgoValue) / yearAgoValue) * 100)
      : null;

  // Season rows, newest season first, highest minutes first within a season.
  const statRows: SeasonStatRow[] = (seasonStats ?? [])
    .map((s) => {
      const season = Array.isArray(s.seasons) ? s.seasons[0] : s.seasons;
      const competition = Array.isArray(s.competitions) ? s.competitions[0] : s.competitions;
      const statClub = Array.isArray(s.clubs) ? s.clubs[0] : s.clubs;
      return {
        id: s.id,
        season_name: season?.name ?? null,
        competition_name: competition?.name ?? null,
        club_name: statClub?.name ?? null,
        matches_played: s.matches_played,
        minutes_played: s.minutes_played,
        goals: s.goals,
        assists: s.assists,
        yellow_cards: s.yellow_cards,
        red_cards: s.red_cards,
      };
    })
    .sort((a, b) =>
      (b.season_name ?? '').localeCompare(a.season_name ?? '') ||
      (b.minutes_played ?? 0) - (a.minutes_played ?? 0),
    );

  const career = statRows.reduce(
    (acc, r) => ({
      apps: acc.apps + (r.matches_played ?? 0),
      minutes: acc.minutes + (r.minutes_played ?? 0),
      goals: acc.goals + (r.goals ?? 0),
      assists: acc.assists + (r.assists ?? 0),
    }),
    { apps: 0, minutes: 0, goals: 0, assists: 0 },
  );

  const isRepresentedByGbm = player.gbm_status && !['NONE', 'UNTRACKED'].includes(player.gbm_status);

  // Current-season aggregates from the already-fetched season rows: the
  // newest season name, its total minutes/apps, and the competition where
  // most of those minutes were played.
  const currentSeasonName = statRows[0]?.season_name ?? null;
  const currentSeasonRows = statRows.filter((r) => r.season_name === currentSeasonName);
  const seasonMinutes = currentSeasonRows.length
    ? currentSeasonRows.reduce((n, r) => n + (r.minutes_played ?? 0), 0)
    : null;
  const seasonApps = currentSeasonRows.length
    ? currentSeasonRows.reduce((n, r) => n + (r.matches_played ?? 0), 0)
    : null;
  const topLeagueRaw = currentSeasonRows[0]?.competition_name ?? null;

  // The opportunity signal carries the score and, in its evidence, which
  // target-market factors contributed — the summary reuses exactly those.
  const opportunity = (signals ?? []).find((s) => s.signal_type === 'GBM_OPPORTUNITY');
  const oppEvidence = (opportunity?.evidence ?? {}) as Record<string, unknown>;
  const summary = buildIntelligenceSummary({
    age: ageYears(player.date_of_birth),
    nationality: nationality?.name ?? null,
    position: player.primary_position,
    clubName: club?.name ?? null,
    leagueName: topLeagueRaw ? (leagueLabel(topLeagueRaw) ?? topLeagueRaw) : null,
    seasonMinutes,
    seasonApps,
    marketValue: latestValue,
    valueChangePct:
      latestValue !== null && yearAgoValue !== null && yearAgoValue > 0
        ? ((latestValue - yearAgoValue) / yearAgoValue) * 100
        : null,
    contractMonths,
    citizenshipIsTarget: Number(oppEvidence.citizenship_pts ?? 0) > 0,
    leagueIsTarget: Number(oppEvidence.league_pts ?? 0) > 0,
    noAgencyListed: representation?.status === 'NO_AGENCY_LISTED',
  });

  /* ------------------------------ TAB PANELS ---------------------------- */

  const overviewPanel = (
    <>
      <Section title="Reference">
        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-3 p-4">
          <Fact label="Born" value={formatDate(player.date_of_birth)} sources={factSources('player.date_of_birth')} conflict={conflictKeys.has('player.date_of_birth')} />
          <Fact label="Height" value={player.height_cm ? `${player.height_cm} cm` : '—'} sources={factSources('player.height_cm')} conflict={conflictKeys.has('player.height_cm')} />
          <Fact label="Foot" value={footLabel(player.foot)} sources={0} />
          <Fact label="Position" value={player.primary_position ?? '—'} sources={factSources('player.primary_position')} conflict={conflictKeys.has('player.primary_position')} />
          <Fact label="Birthplace" value={player.birth_place ?? '—'} sources={0} />
          <Fact label="Sources" value={String(providerCount)} sources={0} />
        </dl>
      </Section>

      {(signals ?? []).length > 0 && (
        <Section title="Discovery signals">
          {(signals ?? []).map((s) => (
            <div key={s.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className={`badge ${s.signal_type === 'GBM_OPPORTUNITY' ? 'badge-gbm' : 'badge-neutral'}`}>
                  {signalLabel(s.signal_type)}
                </span>
                <span className="data text-xs" style={{ color: 'var(--muted)' }}>score {Number(s.score).toFixed(1)}</span>
              </div>
              <p className="text-sm mt-1.5 leading-relaxed">{s.rationale}</p>
            </div>
          ))}
        </Section>
      )}

      <Section title="Availability" subtitle={injuries?.length ? `${injuries.length} recorded` : undefined}>
        {(injuries ?? []).length === 0 ? (
          <p className="text-sm px-4 py-5" style={{ color: 'var(--muted)' }}>
            No injury history from connected sources. Availability tracking activates when an
            injury-capable provider (API-Football, BeSoccer) is connected — absence of data is not
            evidence of fitness.
          </p>
        ) : (
          (injuries ?? []).map((inj) => (
            <div key={inj.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{inj.injury_type ?? inj.description ?? 'Injury'}</p>
                <span className="data text-xs" style={{ color: 'var(--muted)' }}>
                  {formatDate(inj.started_on)} → {formatDate(inj.ended_on ?? inj.expected_return_on)}
                </span>
              </div>
              {inj.games_missed != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{inj.games_missed} games missed</p>
              )}
            </div>
          ))
        )}
      </Section>

      <Section title="Sources" subtitle={`Linked across ${providerCount} provider${providerCount === 1 ? '' : 's'}`}>
        <div className="p-4 flex flex-wrap gap-2">
          {(externalIds ?? []).map((e) => (
            <a
              key={e.id}
              href={e.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-[4px] text-sm font-semibold flex items-center gap-2"
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

      <Section
        title="News and signals"
        subtitle={(news ?? []).length > 0 ? `${(news ?? []).length} most recent` : undefined}
      >
        <div className="p-4">
          {(news ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nothing collected about this player yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {(news ?? []).map((n) => (
                <li key={n.id} className="pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-2 flex-wrap">
                    {n.impact && <ImpactBadge impact={n.impact} />}
                    <p className="text-sm font-semibold flex-1 min-w-[12rem]">{n.headline}</p>
                  </div>
                  {n.summary && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                      {n.summary}
                    </p>
                  )}
                  {n.impact_note && (
                    <p className="text-xs mt-1 leading-relaxed">
                      <span className="eyebrow">What it means</span> {n.impact_note}
                    </p>
                  )}
                  <p className="data text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                    {n.source_url ? (
                      <a href={n.source_url} target="_blank" rel="noopener noreferrer">
                        {n.source_name} ↗
                      </a>
                    ) : (
                      n.source_name
                    )}
                    {' · '}
                    {formatDate(n.published_at ?? n.discovered_at)}
                    {n.reliability != null && ` · source reliability ${Math.round(Number(n.reliability) * 100)}%`}
                    {/* Origin, not provenance: the source is named above; this says
                        who fetched it, which is what tells a scout how to read it. */}
                    {n.agent_id != null && ' · collected by the AI research team'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

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
    </>
  );

  // ---- Position intelligence: shape the versioned percentile rows ---------
  interface PctRow {
    metric_key: string;
    raw_value: number | string | null;
    per90_value: number | string | null;
    percentile: number | string;
    peer_group_size: number;
    model_version: string;
    confidence: string | null;
    cohort: { family?: string; season?: string; band?: string; size?: number; player_minutes?: number } | null;
  }
  const pctRows = (percentiles ?? []) as unknown as PctRow[];
  // Latest season with metric percentiles, newest first by season label.
  const pctSeasons = [...new Set(pctRows.map((r) => r.cohort?.season).filter(Boolean))].sort().reverse() as string[];
  const latestPctSeason = pctSeasons[0] ?? null;
  const seasonPct = pctRows.filter(
    (r) => r.cohort?.season === latestPctSeason && r.model_version === 'POSITION_PERCENTILE_V1',
  );
  const perfScore = pctRows.find(
    (r) => r.cohort?.season === latestPctSeason && r.metric_key === 'PERFORMANCE_SCORE',
  );
  // Role fit answers a different question than performance, so it renders as
  // its own chips, never blended into the score.
  const roleFits = pctRows
    .filter((r) => r.cohort?.season === latestPctSeason && r.model_version === 'GBM_ROLE_FIT_V1')
    .sort((a, b) => Number(b.percentile) - Number(a.percentile));
  const ROLE_LABEL: Record<string, string> = {
    'ROLE_FIT:FINISHER': 'Finisher', 'ROLE_FIT:CREATOR': 'Creator',
  };
  const devSignal = (signals ?? []).find((s) => s.signal_type === 'DEVELOPMENT_TREND');
  const devState = (devSignal?.evidence as { state?: string } | null)?.state ?? null;
  const DEV_LABEL: Record<string, string> = {
    RISING: 'Rising', STABLE: 'Stable', DECLINING: 'Declining',
    BREAKTHROUGH: 'Breakthrough', INSUFFICIENT_HISTORY: 'Not enough history',
  };
  const METRIC_LABEL: Record<string, string> = {
    goals_per90: 'Goals /90', assists_per90: 'Assists /90',
    goal_contributions_per90: 'Goal contributions /90', discipline_per90: 'Cards /90 (lower is better)',
    shots_per90: 'Shots /90', key_passes_per90: 'Key passes /90', xg_per90: 'xG /90',
    pass_accuracy_pct: 'Pass accuracy', saves_per90: 'Saves /90',
  };
  const METRIC_ORDER = ['goals_per90', 'goal_contributions_per90', 'assists_per90', 'shots_per90',
    'key_passes_per90', 'xg_per90', 'saves_per90', 'pass_accuracy_pct', 'discipline_per90'];
  const orderedPct = [...seasonPct].sort(
    (a, b) => METRIC_ORDER.indexOf(a.metric_key) - METRIC_ORDER.indexOf(b.metric_key),
  );

  const performancePanel = (
    <>
      {orderedPct.length > 0 && latestPctSeason && (
        <Section
          title="Performance intelligence"
          subtitle={`${latestPctSeason} · ranked among ${orderedPct[0].peer_group_size} ${orderedPct[0].cohort?.family ?? ''} peers${orderedPct[0].cohort?.band && orderedPct[0].cohort?.band !== 'ALL' ? ` in ${orderedPct[0].cohort?.band} leagues` : ''} · 450+ minutes`}
        >
          {(perfScore || devState) && (
            <div className="px-4 pt-3 flex items-center gap-4 flex-wrap">
              {perfScore && (
                <div className="flex items-baseline gap-2">
                  <span className="data text-2xl font-bold" style={{ color: 'var(--color-gbm-2)' }}>
                    {Math.round(Number(perfScore.percentile))}
                  </span>
                  <span className="eyebrow">Performance /100</span>
                  <span className="badge badge-neutral">{perfScore.confidence}</span>
                </div>
              )}
              {devState && (
                <span
                  className={`badge ${devState === 'DECLINING' ? 'badge-attention' : devState === 'INSUFFICIENT_HISTORY' ? 'badge-neutral' : 'badge-verified'}`}
                  title={devSignal?.rationale ?? undefined}
                >
                  {DEV_LABEL[devState] ?? devState}
                </span>
              )}
              {roleFits.map((r) => (
                <span key={r.metric_key} className="data text-xs" style={{ color: 'var(--muted)' }}>
                  {ROLE_LABEL[r.metric_key] ?? r.metric_key}{' '}
                  <span className="font-semibold" style={{ color: 'var(--fg)' }}>
                    {Math.round(Number(r.percentile))}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="px-4 py-3 grid gap-2">
            {orderedPct.map((r) => {
              const pct = Number(r.percentile);
              return (
                <div key={r.metric_key} className="flex items-center gap-3">
                  <span className="text-xs w-44 shrink-0 truncate" style={{ color: 'var(--muted)' }}>
                    {METRIC_LABEL[r.metric_key] ?? r.metric_key}
                  </span>
                  <div className="flex-1 h-2.5 rounded-[3px] overflow-hidden" style={{ background: 'var(--surface-3)' }} aria-hidden>
                    <div
                      className="h-full rounded-[3px]"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: 'color-mix(in srgb, var(--color-verified) 78%, var(--color-ink))',
                      }}
                    />
                  </div>
                  <span className="data text-xs font-semibold w-10 text-right shrink-0">{Math.round(pct)}</span>
                  <span className="data text-[0.6875rem] w-16 text-right shrink-0" style={{ color: 'var(--muted)' }}>
                    {r.metric_key === 'pass_accuracy_pct'
                      ? `${Number(r.per90_value).toFixed(1)}%`
                      : Number(r.per90_value).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {pctSeasons.length > 1 && (
            <p className="px-4 pb-1 text-xs" style={{ color: 'var(--muted)' }}>
              Earlier seasons ranked: {pctSeasons.slice(1).join(' · ')} — every row keeps its cohort
              and model version in the database.
            </p>
          )}
          <p className="px-4 py-3 text-xs leading-relaxed" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
            Percentiles are POSITION_PERCENTILE_V1: same position family, same season, competition
            strength as a band — never a multiplier. A cohort under 30 players is not ranked at
            all. The performance number summarises only these percentiles (GBM_PERFORMANCE_V1) and
            is separate from GBM fit, role fit and any transition judgement.
          </p>
        </Section>
      )}

      <Section
        title="Season by season"
        subtitle={`${career.apps} apps · ${career.minutes.toLocaleString('en-GB')}′ · ${career.goals}G ${career.assists}A recorded`}
      >
        <SeasonStatsTable rows={statRows} />
        <p className="px-4 py-3 text-xs leading-relaxed" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
          Counting statistics from the connected dataset&#8217;s competition coverage. Advanced metrics
          (xG, duels, progressive actions) and positional analytics (shot maps, heatmaps, passing
          maps) appear only when a licensed event-data provider is connected — GBM never estimates
          or fabricates them.
        </p>
      </Section>
    </>
  );

  const marketPanel = (
    <>
      <Section title="Market value" subtitle={`${valueSeries.length} valuations`}>
        <ValueChart points={valueSeries.map((m) => ({ valued_on: m.valued_on, value_amount: Number(m.value_amount) }))} />
      </Section>

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
          {!contract?.expires_on && (
            <p className="text-xs self-center" style={{ color: 'var(--muted)' }}>
              No contract information from connected sources.
            </p>
          )}
        </div>
      </Section>
    </>
  );

  const careerPanel = (
    <Section title="Transfer history" subtitle={transfers?.length ? `${transfers.length} moves` : undefined}>
      {(transfers ?? []).length === 0 ? (
        <p className="text-sm px-4 py-5" style={{ color: 'var(--muted)' }}>
          No transfer history from connected sources.
        </p>
      ) : (
        (transfers ?? []).map((t) => (
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
        ))
      )}
    </Section>
  );

  const representationPanel = (
    <>
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

      <Section title="Official links">
        <PlayerLinks playerId={id} links={(links ?? []) as PlayerLink[]} />
      </Section>
    </>
  );


  /*
   * AI INTELLIGENCE — its own tab, deliberately.
   *
   * A model's assessment and a scout's observation are different kinds of
   * evidence. Merging them into one "Reports" list would make the interface
   * assert an equivalence the platform does not believe, so this panel says
   * who produced the material, what it read, and how sure it claims to be,
   * on every item. A report with no sources is an opinion and is labelled
   * as one rather than dressed as research.
   */
  const current = (intelReports ?? []).filter((r) => r.is_current);
  const superseded = (intelReports ?? []).filter((r) => !r.is_current);

  const intelPanel = (
    <>
      <p className="px-4 md:px-6 mt-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Produced by an external AI research team, not by a GBM scout. Ranked below every
        source it cites and never merged into verified facts or scouting reports.
      </p>

      {intelRecommendation && (
        <Section title="Recruitment view" subtitle={formatDate(intelRecommendation.created_at)}>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge badge-gbm">{intelRecommendation.recommendation}</span>
              {intelRecommendation.fit_label && (
                <span className="text-sm font-semibold">{intelRecommendation.fit_label}</span>
              )}
              {intelRecommendation.confidence != null && (
                <span className="opportunity text-xs">
                  confidence {Math.round(Number(intelRecommendation.confidence) * 100)}%
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {([
                ['Age profile', intelRecommendation.age_profile],
                ['Financial band', intelRecommendation.financial_band],
                ['Playing style', intelRecommendation.playing_style],
                ['Development', intelRecommendation.development_potential],
                ['Resale', intelRecommendation.resale_potential],
              ] as const)
                .filter(([, v]) => Boolean(v))
                .map(([label, v]) => (
                  <div key={label}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="text-sm mt-0.5">{v}</dd>
                  </div>
                ))}
            </dl>
            {intelRecommendation.rationale && (
              <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {intelRecommendation.rationale}
              </p>
            )}
          </div>
        </Section>
      )}

      {intelAdaptation && (
        <Section title="Adaptation and pathway">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              {intelAdaptation.adaptation_risk && (
                <span
                  className="badge"
                  style={{
                    background:
                      intelAdaptation.adaptation_risk === 'HIGH'
                        ? 'color-mix(in srgb, var(--color-conflict) 16%, transparent)'
                        : intelAdaptation.adaptation_risk === 'LOW'
                          ? 'color-mix(in srgb, var(--color-verified) 16%, transparent)'
                          : 'color-mix(in srgb, var(--color-attention) 16%, transparent)',
                  }}
                >
                  {intelAdaptation.adaptation_risk} risk
                  {intelAdaptation.risk_score != null && ` · ${intelAdaptation.risk_score}/100`}
                </span>
              )}
              {(intelAdaptation.from_competition_name || intelAdaptation.to_competition_name) && (
                <span className="text-sm">
                  {intelAdaptation.from_competition_name ?? '?'} → {intelAdaptation.to_competition_name ?? '?'}
                </span>
              )}
            </div>
            <dl className="grid gap-3 md:grid-cols-2 mt-3">
              {([
                ['Technical gap', intelAdaptation.technical_gap],
                ['Competition gap', intelAdaptation.competition_gap],
                ['Suggested next step', intelAdaptation.next_step],
              ] as const)
                .filter(([, v]) => Boolean(v))
                .map(([label, v]) => (
                  <div key={label}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="text-sm mt-0.5 leading-relaxed">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </Section>
      )}

      {current.length > 0 && (
        <Section title="Reports" subtitle={`${current.length} current`}>
          {current.map((r) => (
            <IntelReport key={r.id} report={r} />
          ))}
        </Section>
      )}

      {superseded.length > 0 && (
        <Section title="Earlier versions" subtitle={`${superseded.length} superseded`}>
          {superseded.map((r) => (
            <IntelReport key={r.id} report={r} superseded />
          ))}
        </Section>
      )}

      {!intelRecommendation && !intelAdaptation && (intelReports ?? []).length === 0 && (
        <div className="surface mx-4 md:mx-6 mt-3 px-4 py-10 text-center">
          <p className="font-semibold text-sm">No external intelligence yet</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
            Nothing has been submitted for this player. See
            docs/AVENGERS_INTEL_CONTRACT.md for how intelligence reaches the platform.
          </p>
        </div>
      )}
    </>
  );

  const notesPanel = (
    <Section
      title="Scouting"
      subtitle={`${reports?.length ?? 0} report${(reports?.length ?? 0) === 1 ? '' : 's'}`}
      action={
        <Link
          href={`/players/${id}/report/new`}
          className="text-xs font-semibold"
          style={{ color: 'var(--color-verified-2)' }}
        >
          New report
        </Link>
      }
    >
      {(reports ?? []).length === 0 ? (
        <p className="text-sm px-4 py-4" style={{ color: 'var(--muted)' }}>
          No GBM scouting reports for this player yet.
        </p>
      ) : (
        (reports ?? []).map((r) => (
          <div key={r.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="data text-xs" style={{ color: 'var(--muted)' }}>{formatDate(r.observed_on)}</span>
              <span className="badge badge-neutral">{statusLabel(r.recommendation)}</span>
              {r.is_draft && <span className="badge badge-neutral">draft</span>}
              {r.overall_rating != null && (
                <span className="data text-sm font-semibold ml-auto">
                  {r.overall_rating}/10
                  {r.potential_rating != null && (
                    <span style={{ color: 'var(--muted)' }}> · pot {r.potential_rating}/10</span>
                  )}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2 max-w-sm">
              <MiniRating label="Tech" value={r.technical} />
              <MiniRating label="Tact" value={r.tactical} />
              <MiniRating label="Phys" value={r.physical} />
              <MiniRating label="Ment" value={r.mental} />
            </div>
            {r.summary && <p className="text-sm mt-2 leading-relaxed">{r.summary}</p>}
            {r.strengths && (
              <p className="text-xs mt-2 leading-relaxed"><strong>Strengths:</strong> {r.strengths}</p>
            )}
            {r.weaknesses && (
              <p className="text-xs mt-1 leading-relaxed"><strong>Weaknesses:</strong> {r.weaknesses}</p>
            )}
          </div>
        ))
      )}

      {(ratings ?? []).length > 0 && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="eyebrow mb-2">Attribute ratings</p>
          <div className="flex flex-wrap gap-2">
            {(ratings ?? []).map((rt) => (
              <span key={rt.attribute} className="pos-chip">
                {rt.attribute} <span className="data font-semibold">{rt.rating}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3" style={{ borderBottom: (notes ?? []).length ? '1px solid var(--border)' : undefined }}>
        <AddNote playerId={id} />
      </div>

      {(notes ?? []).map((n) => (
        <div key={n.id} className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm leading-relaxed">{n.body}</p>
          <p className="data text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatDate(n.created_at)}</p>
        </div>
      ))}
    </Section>
  );

  return (
    <AppShell eyebrow="Player" title={player.full_name}>
      {/* ---------------------------------------------------------------- */}
      {/* HERO — player identity first: photograph, name, why interesting.  */}
      {/* Reference facts live in the Overview tab; this surface answers    */}
      {/* "who is this player and why are we looking at them".              */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-4 md:px-6 pt-3">
        <div className="hero-surface p-4 md:p-6">
          <div className="flex items-start gap-4 md:gap-6">
            <div className="hidden md:block">
              <PlayerPhoto src={player.image_url} name={player.full_name} size={148} priority />
            </div>
            <div className="md:hidden">
              <PlayerPhoto src={player.image_url} name={player.full_name} size={96} priority />
            </div>

            <div className="min-w-0 flex-1">
              <p className="eyebrow">
                {player.primary_position ?? 'Position unknown'} · {club?.name ?? 'Club unknown'}
              </p>
              <div className="flex items-center gap-2.5 flex-wrap mt-1">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-none">
                  {player.full_name}
                </h2>
                {isRepresentedByGbm && (
                  <span className="badge badge-gbm">GBM · {statusLabel(player.gbm_status)}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5 text-sm" style={{ color: 'var(--muted)' }}>
                {nationality?.name && (
                  <>
                    {flag && <span className="flag" aria-hidden="true">{flag}</span>}
                    <span>{nationality.name}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span className="data">{formatAge(player.date_of_birth)}y</span>
                {player.height_cm && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="data">{player.height_cm} cm</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{footLabel(player.foot)}</span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 mt-3.5">
                <span className="data text-2xl md:text-3xl font-bold">{formatCurrency(latestValue)}</span>
                {valueTrend && (
                  <span className={`data text-sm font-semibold ${valueTrend.className}`}>
                    <span aria-hidden="true">{valueTrend.glyph}</span> {valueTrend.text} · 12 mo
                  </span>
                )}
                {contractMonths !== null && (
                  <span className={`badge ${contractMonths <= 18 ? 'badge-attention' : 'badge-neutral'}`}>
                    contract {contractMonths} mo
                  </span>
                )}
                {opportunity && (
                  <span
                    className="opportunity text-sm"
                    title="GBM opportunity model — factors in the Overview tab"
                  >
                    {Math.round(Number(opportunity.score))}
                    <span style={{ opacity: 0.65 }}>/100 GBM fit</span>
                  </span>
                )}
              </div>

              {summary && (
                <p className="mt-3.5 text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--fg)' }}>
                  <span className="eyebrow block mb-1" style={{ color: 'var(--color-gbm)' }}>
                    GBM Intelligence Summary
                  </span>
                  {summary}
                </p>
              )}
            </div>

            <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
              <WatchlistButton playerId={id} />
              <Link
                href={`/compare?ids=${id}`}
                className="px-3 py-2 rounded-[4px] text-sm font-semibold"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                Compare
              </Link>
            </div>
          </div>

          <div className="sm:hidden flex gap-2 mt-3">
            <WatchlistButton playerId={id} />
            <Link
              href={`/compare?ids=${id}`}
              className="px-3 py-2 rounded-[4px] text-sm font-semibold"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              Compare
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-3">
        <Tabs
          defaultTab="overview"
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'performance', label: 'Performance' },
            { id: 'market', label: 'Market' },
            { id: 'career', label: 'Career' },
            { id: 'representation', label: 'Representation' },
            { id: 'intel', label: 'AI Intelligence' },
            { id: 'notes', label: 'GBM Notes' },
          ]}
          panels={{
            overview: overviewPanel,
            performance: performancePanel,
            market: marketPanel,
            career: careerPanel,
            representation: representationPanel,
            intel: intelPanel,
            notes: notesPanel,
          }}
        />
      </div>

      <div className="h-8" />
    </AppShell>
  );
}

function Section({
  title, subtitle, action, children,
}: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="px-4 md:px-6 mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <div className="flex items-baseline gap-3">
          {subtitle && <span className="eyebrow">{subtitle}</span>}
          {action}
        </div>
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

function MiniRating({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center rounded-[4px] py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div className="data text-sm font-semibold">{value ?? '—'}</div>
      <div className="eyebrow" style={{ fontSize: '0.5625rem' }}>{label}</div>
    </div>
  );
}

/**
 * What a story would mean for GBM if it is true — the field that decides
 * whether anyone gets called. Carries its own word, not colour alone, so it
 * survives a colourblind reader and a printout.
 */
function ImpactBadge({ impact }: { impact: string }) {
  // The design system's badge modifiers already pair each tint with a text
  // tone that clears contrast in both themes; picking colours here would
  // quietly undo that.
  const cls =
    impact === 'CRITICAL' || impact === 'HIGH'
      ? 'badge-conflict'
      : impact === 'MEDIUM'
        ? 'badge-attention'
        : 'badge-neutral';
  return <span className={`badge ${cls}`}>{impact}</span>;
}

/**
 * One AI report. The source list is rendered rather than summarised: a claim
 * is only as good as what was read to make it, and an empty list is the most
 * important thing the reader can know about a report.
 */
function IntelReport({
  report,
  superseded = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report: any;
  superseded?: boolean;
}) {
  const sections: Array<{ heading?: string; body?: string }> = Array.isArray(report.sections)
    ? report.sections
    : [];
  const sources: Array<{ name?: string; url?: string; reliability?: number }> = Array.isArray(
    report.sources,
  )
    ? report.sources
    : [];

  return (
    <article
      className="px-4 py-3"
      style={{ borderBottom: '1px solid var(--border)', opacity: superseded ? 0.65 : 1 }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="font-semibold text-sm">{report.headline}</p>
        <span className="eyebrow shrink-0">
          {report.report_type} · v{report.version}
          {report.model_name ? ` · ${report.model_name}` : ''}
        </span>
      </div>

      {report.summary && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
          {report.summary}
        </p>
      )}

      {sections.map((sec, i) => (
        <div key={`${sec.heading ?? i}`} className="mt-2">
          {sec.heading && <p className="eyebrow">{sec.heading}</p>}
          {sec.body && <p className="text-xs mt-0.5 leading-relaxed">{sec.body}</p>}
        </div>
      ))}

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {report.confidence != null && (
          <span className="opportunity text-[0.6875rem]">
            confidence {Math.round(Number(report.confidence) * 100)}%
          </span>
        )}
        {sources.length === 0 ? (
          <span className="badge badge-attention">Opinion — no sources cited</span>
        ) : (
          sources.slice(0, 4).map((src, i) => (
            <span key={`${src.name ?? i}`} className="badge badge-neutral">
              {src.name ?? 'source'}
              {src.reliability != null && ` ${Math.round(Number(src.reliability) * 100)}%`}
            </span>
          ))
        )}
      </div>
    </article>
  );
}
