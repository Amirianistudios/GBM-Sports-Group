'use client';

import { useActionState } from 'react';
import { createRequirement } from './actions';

/**
 * The club brief.
 *
 * Only the position is required. A club says "we need a striker" long before
 * it has agreed a budget, and a form that refuses to save until every number
 * is settled is a form people fill with guesses. Everything left blank stays
 * NULL, and the engine treats an absent budget as "no ceiling stated" rather
 * than as zero.
 *
 * Positions are offered as codes because that is what a sporting director
 * says. The engine expands each to the family of stored position strings it
 * matches, which is what keeps 'Left-Back' and 'Left fullback' from being two
 * different searches.
 */

const POSITIONS = [
  ['GK', 'Goalkeeper'],
  ['CB', 'Centre-back'],
  ['LB', 'Left-back'],
  ['RB', 'Right-back'],
  ['DM', 'Defensive midfield'],
  ['CM', 'Central midfield'],
  ['AM', 'Attacking midfield'],
  ['LW', 'Left winger'],
  ['RW', 'Right winger'],
  ['ST', 'Striker'],
] as const;

const URGENCY = [
  ['THIS_WINDOW', 'This window'],
  ['IMMEDIATE', 'Immediate'],
  ['NEXT_WINDOW', 'Next window'],
  ['MONITORING', 'Monitoring'],
] as const;

const CONTRACT = [
  ['ANY', 'Any'],
  ['FREE_AGENT', 'Free agent'],
  ['EXPIRING_6M', 'Expiring within 6 months'],
  ['EXPIRING_12M', 'Expiring within 12 months'],
  ['UNDER_CONTRACT', 'Under contract'],
] as const;

export function RequirementForm() {
  const [state, action, pending] = useActionState(createRequirement, null);

  return (
    <section className="px-4 md:px-6 mt-4">
      <details className="card overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold">
          New club requirement
        </summary>

        <form action={action} className="px-4 pb-4 pt-1 grid gap-3 md:grid-cols-3">
          <Field label="Club" hint="Free text — the club need not be in the register yet">
            <input name="club_name" className="input" autoComplete="off" />
          </Field>
          <Field label="Brief title" hint="Optional">
            <input name="title" className="input" placeholder="Striker, winter window" autoComplete="off" />
          </Field>
          <Field label="Position" hint="Required">
            <select name="position_required" className="input" defaultValue="ST" required>
              {POSITIONS.map(([code, label]) => (
                <option key={code} value={code}>{`${code} — ${label}`}</option>
              ))}
            </select>
          </Field>

          <Field label="Tactical role" hint="Optional, free text">
            <input name="tactical_role" className="input" placeholder="Pressing forward" autoComplete="off" />
          </Field>
          <Field label="Age from">
            <input name="age_min" type="number" min={14} max={45} className="input" placeholder="18" />
          </Field>
          <Field label="Age to">
            <input name="age_max" type="number" min={14} max={45} className="input" placeholder="25" />
          </Field>

          <Field label="Transfer budget from" hint="Euros">
            <input name="transfer_budget_min" inputMode="numeric" className="input" placeholder="0" />
          </Field>
          <Field label="Transfer budget to" hint="Euros — leave blank for no ceiling">
            <input name="transfer_budget_max" inputMode="numeric" className="input" placeholder="500000" />
          </Field>
          <Field label="Salary ceiling" hint="Euros per month">
            <input name="salary_budget_max" inputMode="numeric" className="input" placeholder="15000" />
          </Field>

          <Field label="Country" hint="Where the club plays">
            <input name="country" className="input" placeholder="Belgium" autoComplete="off" />
          </Field>
          <Field label="League" hint="Optional">
            <input name="league" className="input" placeholder="Belgian First Division" autoComplete="off" />
          </Field>
          <Field label="Competition level" hint="Optional">
            <input name="competition_level" className="input" placeholder="FIRST_DIVISION" autoComplete="off" />
          </Field>

          <div className="md:col-span-3">
            <Field
              label="Player profile"
              hint="The brief in the club's own words — stored verbatim, never turned into a score"
            >
              <input
                name="player_profile_description"
                className="input"
                placeholder="Goal scorer, physical striker, development potential, European experience preferred"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="Preferred markets" hint="Comma-separated countries">
            <input name="preferred_markets" className="input" placeholder="Georgia, Ukraine" autoComplete="off" />
          </Field>
          <Field label="Contract preference">
            <select name="contract_preference" className="input" defaultValue="ANY">
              {CONTRACT.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </Field>

          <Field label="Urgency">
            <select name="urgency" className="input" defaultValue="THIS_WINDOW">
              {URGENCY.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes" hint="Anything the numbers do not carry">
              <input name="notes" className="input" autoComplete="off" />
            </Field>
          </div>

          {state?.error && (
            <p className="md:col-span-3 text-xs" style={{ color: '#E0705B' }}>
              {state.error}
            </p>
          )}

          <div className="md:col-span-3 flex items-center gap-3">
            <button type="submit" className="badge badge-gbm !px-4 !py-2 !text-xs" disabled={pending}>
              {pending ? 'Ranking…' : 'Create and rank'}
            </button>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Only the position is required. Blank fields stay unknown rather than becoming zero.
            </span>
          </div>
        </form>
      </details>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}
