'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { leagueLabel } from '@/lib/format';

/**
 * Search + filter drawer.
 *
 * On mobile the filters live behind a sheet: a scout typing a name one-handed
 * should not have to scroll past twelve selects to reach the results. On
 * desktop the same controls sit inline.
 */
export function PlayerFilters({
  positions,
  nationalities,
  leagues = [],
}: {
  positions: string[];
  nationalities: string[];
  leagues?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');

  function apply(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') sp.delete(key);
      else sp.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  const activeCount = [
    'position', 'nationality', 'foot', 'agency', 'ageMin', 'ageMax', 'minHeight', 'maxValue',
    'contract', 'league', 'minMinutes', 'minApps', 'minGoals', 'minAssists', 'minG90', 'minA90',
  ].filter((k) => params.get(k)).length;

  return (
    <div className="px-4 md:px-6 pt-3">
      <form
        onSubmit={(e) => { e.preventDefault(); apply({ q }); }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name"
          aria-label="Search players by name"
          className="flex-1 min-w-0 px-3 py-2.5 text-base rounded-[3px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="px-3 py-2.5 rounded-[3px] text-sm font-semibold shrink-0 flex items-center gap-1.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
        >
          Filters
          {activeCount > 0 && (
            <span
              className="data text-[0.625rem] px-1.5 rounded-full"
              style={{ background: 'var(--color-verified)', color: '#fff' }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </form>

      {open && (
        <div className="surface mt-2 p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="Position" name="position" value={params.get('position') ?? ''}
                  options={positions} onChange={(v) => apply({ position: v })} />
          <Select label="Nationality" name="nationality" value={params.get('nationality') ?? ''}
                  options={nationalities} onChange={(v) => apply({ nationality: v })} />
          <Select label="Foot" name="foot" value={params.get('foot') ?? ''}
                  options={['LEFT', 'RIGHT', 'BOTH']} onChange={(v) => apply({ foot: v })} />
          <Select label="Agency" name="agency" value={params.get('agency') ?? ''}
                  options={[['none', 'No agency listed'], ['known', 'Known agency']]}
                  onChange={(v) => apply({ agency: v })} />

          {leagues.length > 0 && (
            <Select label="League (this season)" name="league" value={params.get('league') ?? ''}
                    options={leagues.map((l) => [l, leagueLabel(l) ?? l] as [string, string])} onChange={(v) => apply({ league: v })} />
          )}

          <Number label="Min age" value={params.get('ageMin') ?? ''} onChange={(v) => apply({ ageMin: v })} />
          <Number label="Max age" value={params.get('ageMax') ?? ''} onChange={(v) => apply({ ageMax: v })} />
          <Number label="Min height (cm)" value={params.get('minHeight') ?? ''} onChange={(v) => apply({ minHeight: v })} />
          <Number label="Max value (€m)" value={params.get('maxValue') ?? ''} onChange={(v) => apply({ maxValue: v })} />

          <Number label="Min minutes (season)" value={params.get('minMinutes') ?? ''} onChange={(v) => apply({ minMinutes: v })} />
          <Number label="Min appearances" value={params.get('minApps') ?? ''} onChange={(v) => apply({ minApps: v })} />
          <Number label="Min goals" value={params.get('minGoals') ?? ''} onChange={(v) => apply({ minGoals: v })} />
          <Number label="Min assists" value={params.get('minAssists') ?? ''} onChange={(v) => apply({ minAssists: v })} />
          <Number label="Min goals /90" value={params.get('minG90') ?? ''} onChange={(v) => apply({ minG90: v })} />
          <Number label="Min assists /90" value={params.get('minA90') ?? ''} onChange={(v) => apply({ minA90: v })} />

          <Select label="Contract ends within" name="contract" value={params.get('contract') ?? ''}
                  options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months'], ['18', '18 months'], ['24', '24 months']]}
                  onChange={(v) => apply({ contract: v })} />
          <Select label="Sort by" name="sort" value={params.get('sort') ?? 'value'}
                  options={[
                    ['value', 'Market value'],
                    ['growth', 'Value growth (12m)'],
                    ['signal', 'Signal score'],
                    ['minutes', 'Season minutes'],
                    ['goals', 'Season goals'],
                    ['g90', 'Goals per 90'],
                    ['a90', 'Assists per 90'],
                    ['lowvalue', 'Lowest market value'],
                    ['age', 'Age (youngest)'],
                    ['contract', 'Contract ending'],
                    ['recent', 'Recently added'],
                    ['name', 'Name'],
                  ]}
                  onChange={(v) => apply({ sort: v })} />

          <div className="col-span-2 md:col-span-4 flex justify-end pt-1">
            <button
              type="button"
              onClick={() => startTransition(() => router.push(pathname))}
              className="text-xs font-semibold px-3 py-2"
              style={{ color: 'var(--muted)' }}
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {pending && <p className="eyebrow mt-2">Updating…</p>}
    </div>
  );
}

type Opt = string | [string, string];

function Select({
  label, name, value, options, onChange,
}: { label: string; name: string; value: string; options: Opt[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 text-sm rounded-[3px]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        <option value="">Any</option>
        {options.map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o, o];
          return <option key={val} value={val}>{text}</option>;
        })}
      </select>
    </label>
  );
}

function Number({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        defaultValue={value}
        onBlur={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 text-sm rounded-[3px] data"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      />
    </label>
  );
}
