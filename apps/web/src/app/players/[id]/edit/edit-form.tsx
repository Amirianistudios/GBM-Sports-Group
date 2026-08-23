'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { editPlayer, type EditPlayerResult } from './actions';

export interface EditLabels {
  intro: string;
  identity: string;
  football: string;
  representation: string;
  media: string;
  mediaNote: string;
  saved: string;
  savedPartial: string;
  fullName: string;
  dob: string;
  nationality: string;
  position: string;
  height: string;
  foot: string;
  footLeft: string;
  footRight: string;
  footBoth: string;
  club: string;
  marketValue: string;
  contractExpires: string;
  repStart: string;
  notes: string;
  portraitUrl: string;
  heroUrl: string;
  imageCredit: string;
  save: string;
  cancel: string;
}

export interface EditValues {
  player_id: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  primary_position: string;
  height_cm: string;
  foot: string;
  club_name: string;
  market_value_eur: string;
  contract_expires_on: string;
  representation_start: string;
  notes: string;
  gbm_portrait_url: string;
  gbm_hero_image_url: string;
  image_credit: string;
}

/**
 * The edit form is pre-filled with the current record, so the fields double as
 * the answer to "what do we actually know about this player" — an empty box is
 * a gap, visible at a glance, and filling it is the whole interaction.
 *
 * Nothing here is required except the name. An agency knows a player long
 * before it knows his height, and demanding fields nobody has is how real
 * records get filled with invented ones.
 */
export function EditForm({ values, labels }: { values: EditValues; labels: EditLabels }) {
  const [result, action, pending] = useActionState<EditPlayerResult | null, FormData>(
    editPlayer,
    null,
  );

  return (
    <form action={action} className="px-4 md:px-6 pt-4 max-w-2xl">
      <input type="hidden" name="player_id" value={values.player_id} />

      <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
        {labels.intro}
      </p>

      {result?.error && (
        <p
          role="alert"
          className="text-sm px-3 py-2 rounded-[3px] mb-4"
          style={{
            background: 'color-mix(in srgb, var(--color-conflict) 12%, transparent)',
            color: 'var(--color-conflict)',
          }}
        >
          {result.error}
        </p>
      )}
      {result?.saved && (
        <p
          role="status"
          className="text-sm px-3 py-2 rounded-[3px] mb-4"
          style={{
            background: 'color-mix(in srgb, var(--color-verified) 12%, transparent)',
            color: 'var(--color-verified-2)',
          }}
        >
          {result.problems?.length
            ? labels.savedPartial.replace('{problems}', result.problems.join('; '))
            : labels.saved}
        </p>
      )}

      <Section title={labels.identity}>
        <Field name="full_name" label={labels.fullName} defaultValue={values.full_name} required />
        <Field name="date_of_birth" label={labels.dob} type="date" defaultValue={values.date_of_birth} />
        <Field name="nationality" label={labels.nationality} defaultValue={values.nationality} />
      </Section>

      <Section title={labels.football}>
        <Field name="primary_position" label={labels.position} defaultValue={values.primary_position} />
        <Field name="club_name" label={labels.club} defaultValue={values.club_name} />
        <Field name="height_cm" label={labels.height} type="number" defaultValue={values.height_cm} />
        <div>
          <label htmlFor="foot" className="eyebrow block mb-1.5">{labels.foot}</label>
          <select id="foot" name="foot" defaultValue={values.foot} className="gbm-input">
            <option value="">—</option>
            <option value="LEFT">{labels.footLeft}</option>
            <option value="RIGHT">{labels.footRight}</option>
            <option value="BOTH">{labels.footBoth}</option>
          </select>
        </div>
        <Field
          name="market_value_eur"
          label={labels.marketValue}
          type="number"
          step="0.01"
          defaultValue={values.market_value_eur}
        />
        <Field
          name="contract_expires_on"
          label={labels.contractExpires}
          type="date"
          defaultValue={values.contract_expires_on}
        />
      </Section>

      <Section title={labels.representation}>
        <Field
          name="representation_start"
          label={labels.repStart}
          type="date"
          defaultValue={values.representation_start}
        />
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="eyebrow block mb-1.5">{labels.notes}</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values.notes}
            className="gbm-input"
          />
        </div>
      </Section>

      <Section title={labels.media} note={labels.mediaNote}>
        <Field
          name="gbm_portrait_url"
          label={labels.portraitUrl}
          type="url"
          placeholder="https://…"
          defaultValue={values.gbm_portrait_url}
        />
        <Field
          name="gbm_hero_image_url"
          label={labels.heroUrl}
          type="url"
          placeholder="https://…"
          defaultValue={values.gbm_hero_image_url}
        />
        <Field name="image_credit" label={labels.imageCredit} defaultValue={values.image_credit} />
      </Section>

      <div className="flex items-center gap-3 mt-6 mb-10">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-[4px] text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-gbm)', color: '#14100A' }}
        >
          {labels.save}
        </button>
        <Link
          href={`/players/${values.player_id}`}
          className="text-sm font-semibold"
          style={{ color: 'var(--muted)' }}
        >
          {labels.cancel}
        </Link>
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
    <section className="card p-4 mb-4">
      <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
      {note && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
          {note}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  type = 'text',
  step,
  placeholder,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="eyebrow block mb-1.5">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className="gbm-input"
      />
    </div>
  );
}
