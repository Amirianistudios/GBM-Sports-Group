import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { PlayerPhoto } from '@/components/player-photo';
import { countryFlag } from '@/lib/flags';
import { formatCurrency, formatDate, positionCode } from '@/lib/format';
import { recomputeRequirement } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * RANKED CANDIDATES against one requirement.
 *
 * Three kinds of knowledge appear on every card and are never blended:
 *
 *   verified   — the player facts and the four computed components, straight
 *                from stored provider data.
 *   AI         — technical and adaptation scores and the prose explanation,
 *                written only by the research team. Absent until it submits,
 *                and labelled when present.
 *   assumption — the requirement's own budget and age band, shown once at the
 *                top as the club's stated brief, never mixed into a score.
 *
 * The list is ordered by `ranked_score`, which shrinks the fit toward 50 in
 * proportion to what is missing — but the card shows `overall_score` and the
 * coverage, because those are the two numbers a recruiter actually reasons
 * with. Ordering by the raw fit put the least-documented players first.
 */

const PAGE_SIZE = 40;

type SearchParams = Promise<{
  position?: string; country?: string; ageMin?: string; ageMax?: string;
  valueMax?: string; contract?: string; league?: string; foot?: string;
  minHeight?: string; minConfidence?: string; page?: string;
}>;

const FEET = ['LEFT', 'RIGHT', 'BOTH', 'UNKNOWN'] as const;

const BAND_CLASS: Record<string, string> = {
  HIGH: 'badge-verified',
  MODERATE: 'badge-attention',
  LOW: 'badge-neutral',
  MINIMAL: 'badge-neutral',
};

export default async function RequirementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: requirement } = await supabase
    .from('recruitment_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!requirement) notFound();

  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('v_recruitment_shortlist')
    .select('*', { count: 'exact' })
    .eq('recruitment_request_id', id)
    .order('ranked_score', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  // Every filter narrows an already-scored set. A filter on a field the player
  // lacks excludes him — which is correct here in a way it is not in scoring:
  // asking for left-footed players is asking to see only players known to be
  // left-footed, not everyone who might be.
  if (sp.position) query = query.eq('primary_position', sp.position);
  if (sp.country) query = query.eq('nationality', sp.country);
  if (sp.league) query = query.eq('league_name', sp.league);
  // `foot` is an enum column; an arbitrary query string is not assignable to
  // it, and passing one through would be a filter on a value that cannot exist.
  if (sp.foot && (FEET as readonly string[]).includes(sp.foot)) {
    query = query.eq('foot', sp.foot as (typeof FEET)[number]);
  }
  if (sp.ageMin) query = query.gte('age', Number(sp.ageMin));
  if (sp.ageMax) query = query.lte('age', Number(sp.ageMax));
  if (sp.valueMax) query = query.lte('market_value', Number(sp.valueMax));
  if (sp.minHeight) query = query.gte('height_cm', Number(sp.minHeight));
  if (sp.minConfidence) query = query.gte('confidence_level', Number(sp.minConfidence));
  if (sp.contract === 'free') query = query.is('contract_expires_on', null);
  if (sp.contract === 'expiring') {
    const in12 = new Date();
    in12.setMonth(in12.getMonth() + 12);
    query = query.lte('contract_expires_on', in12.toISOString().slice(0, 10));
  }

  // The candidate page and the facet scan are independent — running them in
  // series made this the slowest route in the app with the least feedback.
  const [{ data: candidates, count, error }, { data: facetRows }] = await Promise.all([
    query,
    // Facet options come from the scored set, so a filter never offers a
    // value that would return nothing.
    supabase
      .from('v_recruitment_shortlist')
      .select('primary_position, nationality, league_name, foot')
      .eq('recruitment_request_id', id)
      .limit(2000),
  ]);
  if (error) console.error(`[recruitment] candidates read failed — ${error.message}`);

  const rows = candidates ?? [];
  const total = count ?? 0;

  const facets = {
    position: uniq(facetRows?.map((r) => r.primary_position)),
    country: uniq(facetRows?.map((r) => r.nationality)),
    league: uniq(facetRows?.map((r) => r.league_name)),
    foot: uniq(facetRows?.map((r) => r.foot)),
  };

  const brief = [
    requirement.preferred_age_min !== null || requirement.preferred_age_max !== null
      ? `Age ${requirement.preferred_age_min ?? '?'}–${requirement.preferred_age_max ?? '?'}`
      : null,
    requirement.transfer_budget_max !== null
      ? `Transfer to ${formatCurrency(requirement.transfer_budget_max)}`
      : 'No transfer ceiling stated',
    requirement.salary_budget_max !== null
      ? `Salary to ${formatCurrency(requirement.salary_budget_max)}/mo`
      : null,
    (requirement.preferred_markets ?? []).length > 0
      ? `Markets: ${(requirement.preferred_markets as string[]).join(', ')}`
      : null,
    requirement.competition_level,
    requirement.tactical_role,
  ].filter(Boolean) as string[];

  return (
    <AppShell
      eyebrow="Recruitment"
      title={requirement.title ?? `${requirement.position_required} required`}
    >
      {/* The club's stated brief — assumptions, kept visibly apart from any
          measurement of a player. */}
      <section className="px-4 md:px-6 pt-3">
        <div className="card p-4">
          <p className="eyebrow">Stated by {requirement.club_name ?? 'the club'}</p>
          <p className="text-sm mt-1">{brief.join(' · ')}</p>
          {requirement.notes && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              {requirement.notes}
            </p>
          )}
          <form action={recomputeRequirement} className="mt-3">
            <input type="hidden" name="requirement_id" value={id} />
            <button type="submit" className="badge badge-neutral !px-3 !py-1.5 !text-xs">
              Re-rank against current data
            </button>
          </form>
        </div>
      </section>

      <Filters id={id} sp={sp} facets={facets} total={total} />

      <section className="px-4 md:px-6 mt-3 grid gap-2">
        {rows.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-semibold">No candidate matches these filters</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {total === 0
                ? 'Nothing has been ranked against this requirement yet — try re-ranking.'
                : 'Clear a filter to widen the search.'}
            </p>
          </div>
        ) : (
          rows.map((r) => <CandidateCard key={r.id as string} r={r} />)
        )}
      </section>

      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between px-4 md:px-6 py-4">
          {page > 1 ? (
            <Link href={hrefWith(id, sp, page - 1)} className="badge badge-neutral !px-3 !py-1.5 !text-xs">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="eyebrow">
            {from + 1}–{from + rows.length} of {total}
          </span>
          {from + rows.length < total ? (
            <Link href={hrefWith(id, sp, page + 1)} className="badge badge-neutral !px-3 !py-1.5 !text-xs">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <div className="h-8" />
    </AppShell>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CandidateCard({ r }: { r: any }) {
  const flag = countryFlag(r.nationality);
  const missing: string[] = r.missing_information ?? [];
  const hasAi = r.technical_score !== null || r.adaptation_score !== null;

  return (
    <article className="card p-4">
      <div className="flex items-start gap-3">
        <PlayerPhoto src={r.portrait_url} name={r.full_name} size={52} />

        <div className="min-w-0 flex-1">
          <Link href={`/players/${r.player_id}`} className="font-semibold text-[0.9375rem] truncate block">
            {r.full_name}
          </Link>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
            {[
              positionCode(r.primary_position),
              r.age !== null ? `${Math.floor(Number(r.age))}` : 'age unknown',
              flag ?? null,
              r.club_name ?? 'club unknown',
              r.league_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="data text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {r.market_value !== null ? formatCurrency(r.market_value) : 'No valuation'}
            {' · '}
            {r.contract_expires_on ? `contract to ${formatDate(r.contract_expires_on)}` : 'contract unknown'}
            {r.height_cm ? ` · ${r.height_cm}cm` : ''}
          </p>
        </div>

        {/* The fit and its coverage, always together. One without the other is
            the misreading this module exists to prevent. */}
        <div className="text-right shrink-0">
          <p className="data text-2xl font-bold tracking-tight">
            {r.overall_score !== null ? Math.round(Number(r.overall_score)) : '—'}
          </p>
          <span className={`badge ${BAND_CLASS[r.confidence_band] ?? 'badge-neutral'}`}>
            {Math.round(Number(r.confidence_level) * 100)}% known
          </span>
        </div>
      </div>

      {/* Verified — computed from stored data, reproducible. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        <Component label="Statistical" value={r.statistical_score} />
        <Component label="Financial" value={r.financial_score} />
        <Component label="Market" value={r.market_score} />
        <Component label="Risk" value={r.risk_score} />
      </div>

      {r.computed_explanation && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
          <span className="eyebrow">From the record</span> {r.computed_explanation}
        </p>
      )}

      {/* AI — separate block, separate label, never merged with the above. */}
      {hasAi ? (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-neutral">AI assessment</span>
            {r.technical_score !== null && (
              <span className="data text-xs">technical {Math.round(Number(r.technical_score))}</span>
            )}
            {r.adaptation_score !== null && (
              <span className="data text-xs">adaptation {Math.round(Number(r.adaptation_score))}</span>
            )}
          </div>
          {r.ai_explanation && (
            <p className="text-xs mt-1.5 leading-relaxed">{r.ai_explanation}</p>
          )}
        </div>
      ) : (
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          No scouting assessment yet — this score rests on the record alone.
        </p>
      )}

      {missing.length > 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          <span className="eyebrow">Not known</span> {missing.join(', ')}
        </p>
      )}
    </article>
  );
}

/** A null component is drawn as unknown, never as a zero bar. */
function Component({ label, value }: { label: string; value: number | null }) {
  const known = value !== null && value !== undefined;
  return (
    <div className="rounded-[4px] px-2 py-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div className="eyebrow" style={{ fontSize: '0.5625rem' }}>{label}</div>
      <div className="data text-sm font-semibold" style={{ color: known ? undefined : 'var(--muted)' }}>
        {known ? Math.round(Number(value)) : 'unknown'}
      </div>
    </div>
  );
}

function Filters({
  id,
  sp,
  facets,
  total,
}: {
  id: string;
  sp: Record<string, string | undefined>;
  facets: Record<string, string[]>;
  total: number;
}) {
  const active = Object.entries(sp).filter(([k, v]) => v && k !== 'page').length;
  return (
    <section className="px-4 md:px-6 mt-4">
      <form method="GET" action={`/recruitment/${id}`} className="card p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Select name="position" label="Position" value={sp.position} options={facets.position} />
          <Select name="country" label="Country" value={sp.country} options={facets.country} />
          <Select name="league" label="League" value={sp.league} options={facets.league} />
          <Select name="foot" label="Foot" value={sp.foot} options={facets.foot} />
          <Select
            name="contract"
            label="Contract"
            value={sp.contract}
            options={['free', 'expiring']}
            labels={{ free: 'None on record', expiring: 'Expiring ≤12mo' }}
          />
          <Num name="ageMin" label="Age from" value={sp.ageMin} />
          <Num name="ageMax" label="Age to" value={sp.ageMax} />
          <Num name="valueMax" label="Value to (€)" value={sp.valueMax} />
          <Num name="minHeight" label="Height from (cm)" value={sp.minHeight} />
          <Select
            name="minConfidence"
            label="Minimum known"
            value={sp.minConfidence}
            options={['0.25', '0.5', '0.8']}
            labels={{ '0.25': '25%+', '0.5': '50%+', '0.8': '80%+' }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button type="submit" className="badge badge-neutral !px-3 !py-1.5 !text-xs">
            Apply
          </button>
          {active > 0 && (
            <Link href={`/recruitment/${id}`} className="badge badge-neutral !px-3 !py-1.5 !text-xs">
              Clear {active}
            </Link>
          )}
          <span className="eyebrow ml-auto">{total} ranked</span>
        </div>
      </form>
    </section>
  );
}

function Select({
  name,
  label,
  value,
  options,
  labels,
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select name={name} defaultValue={value ?? ''} className="input">
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input name={name} inputMode="numeric" defaultValue={value ?? ''} className="input" />
    </label>
  );
}

function uniq(values: (string | null | undefined)[] | undefined): string[] {
  return [...new Set((values ?? []).filter((v): v is string => Boolean(v)))].sort();
}

function hrefWith(id: string, sp: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== 'page') params.set(k, v);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `/recruitment/${id}?${s}` : `/recruitment/${id}`;
}
