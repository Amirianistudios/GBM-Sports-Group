'use client';

import { useActionState, useState } from 'react';
import { addPlayer, type AddPlayerResult } from './actions';

/**
 * The form is grouped the way an agent thinks about a player: who he is, where
 * he plays, what GBM's relationship is, and — only when the date of birth says
 * so — who speaks for him.
 *
 * The guardian section appears from the entered date of birth rather than a
 * checkbox, so nobody has to remember to tick it. That is a convenience, not
 * the protection: the protection is RLS on player_guardians.
 */

interface Staff {
  id: string;
  name: string;
  role: string;
}

function ageFrom(dob: string): number | null {
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

export function AddPlayerForm({
  staff,
  canSeeGuardian,
}: {
  staff: Staff[];
  canSeeGuardian: boolean;
}) {
  const [state, formAction, pending] = useActionState<AddPlayerResult | null, FormData>(
    addPlayer,
    null,
  );
  const [dob, setDob] = useState('');

  const age = dob ? ageFrom(dob) : null;
  const isMinor = age !== null && age < 18;

  return (
    <form action={formAction} className="px-4 md:px-6 pt-4 max-w-3xl">
      {state?.error && (
        <p
          className="card p-3 mb-4 text-sm"
          style={{ color: '#E0705B', borderColor: 'color-mix(in srgb, var(--color-conflict) 40%, transparent)' }}
        >
          {state.error}
        </p>
      )}

      <Section title="Identity">
        <Field label="Full name" required>
          <input name="full_name" required className="input" autoComplete="off" />
        </Field>
        <Field label="Date of birth" hint={age !== null ? `${age.toFixed(1)} years old` : undefined}>
          <input
            name="date_of_birth"
            type="date"
            className="input"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </Field>
        <Field label="Nationality">
          <input name="nationality" className="input" placeholder="Georgia" autoComplete="off" />
        </Field>
        <Field label="Second nationality">
          <input name="second_nationality" className="input" autoComplete="off" />
        </Field>
      </Section>

      <Section title="Playing profile">
        <Field label="Position">
          <input name="primary_position" className="input" placeholder="Central Midfield" autoComplete="off" />
        </Field>
        <Field label="Secondary position(s)" hint="Comma-separated">
          <input name="secondary_position" className="input" autoComplete="off" />
        </Field>
        <Field label="Current club">
          <input name="club_name" className="input" autoComplete="off" />
        </Field>
        <Field label="Height (cm)">
          <input name="height_cm" type="number" inputMode="numeric" className="input" />
        </Field>
        <Field label="Preferred foot">
          <select name="foot" className="input" defaultValue="">
            <option value="">Unknown</option>
            <option value="LEFT">Left</option>
            <option value="RIGHT">Right</option>
            <option value="BOTH">Both</option>
          </select>
        </Field>
        <Field label="Market value (€m)" hint="Recorded as a GBM-internal valuation, dated today">
          <input name="market_value_eur" className="input data" placeholder="0.4" inputMode="decimal" />
        </Field>
      </Section>

      <Section title="Representation">
        <Field label="Status">
          <select name="status" className="input" defaultValue="REPRESENTED">
            <option value="REPRESENTED">Represented</option>
            <option value="IN_DISCUSSION">In discussion</option>
            <option value="REVIEW_QUEUE">Needs verification</option>
            <option value="FORMER">Former</option>
          </select>
        </Field>
        <Field label="Representation start">
          <input name="representation_start" type="date" className="input" />
        </Field>
        <Field label="Contract expires">
          <input name="contract_expires_on" type="date" className="input" />
        </Field>
        <Field label="Responsible at GBM">
          <select name="assigned_staff_id" className="input" defaultValue="">
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How this is verified" wide>
          <input
            name="verification_note"
            className="input"
            placeholder="Signed mandate on file, dated…"
            autoComplete="off"
          />
        </Field>
      </Section>

      <Section title="Imagery" note="Only images GBM holds rights to. Never a scraped photograph.">
        <Field label="Portrait URL" wide>
          <input name="gbm_portrait_url" className="input" inputMode="url" autoComplete="off" />
        </Field>
        <Field label="Hero / action image URL" wide>
          <input name="gbm_hero_image_url" className="input" inputMode="url" autoComplete="off" />
        </Field>
        <Field label="Image credit" wide>
          <input name="image_credit" className="input" autoComplete="off" />
        </Field>
      </Section>

      {isMinor && (
        <Section
          title="Guardian — this player is under 18"
          note={
            canSeeGuardian
              ? 'Stored under restricted access: only the owner and executive director can read these fields.'
              : 'Your role cannot store guardian details. Ask the owner to complete this section.'
          }
        >
          <fieldset disabled={!canSeeGuardian} className="contents">
            <Field label="Guardian name">
              <input name="guardian_name" className="input" autoComplete="off" />
            </Field>
            <Field label="Relationship">
              <input name="guardian_relationship" className="input" placeholder="Father" autoComplete="off" />
            </Field>
            <Field label="Guardian email">
              <input name="guardian_email" type="email" className="input" autoComplete="off" />
            </Field>
            <Field label="Guardian phone">
              <input name="guardian_phone" className="input" inputMode="tel" autoComplete="off" />
            </Field>
            <Field label="Consent document reference" wide>
              <input name="consent_reference" className="input" autoComplete="off" />
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="consent_on_file" />
              Signed guardian consent is on file
            </label>
          </fieldset>
        </Section>
      )}

      <Section title="Internal notes">
        <Field label="Notes" wide>
          <textarea name="notes" rows={3} className="input" />
        </Field>
      </Section>

      <div className="flex items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2.5 rounded-[4px] text-sm font-semibold"
          style={{ background: 'var(--color-gbm)', color: '#14100A', opacity: pending ? 0.6 : 1 }}
        >
          {pending ? 'Adding…' : 'Add to portfolio'}
        </button>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          Only the full name is required.
        </span>
      </div>
    </form>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-0.5">{title}</h2>
      {note && (
        <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
          {note}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="eyebrow block mb-1">
        {label}
        {required && <span style={{ color: 'var(--color-gbm)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <span className="text-xs block mt-1" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}
