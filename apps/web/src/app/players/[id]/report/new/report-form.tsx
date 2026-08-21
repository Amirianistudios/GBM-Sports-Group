'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const RECOMMENDATIONS = [
  ['UNDECIDED', 'Undecided'],
  ['MONITOR', 'Monitor'],
  ['SCOUT_AGAIN', 'Scout again'],
  ['SIGN', 'Sign'],
  ['REPRESENT', 'Represent'],
  ['PASS', 'Pass'],
] as const;

type Recommendation = (typeof RECOMMENDATIONS)[number][0];

/**
 * The full GBM scouting report: four 1–10 pillars, overall and potential,
 * strengths / weaknesses / summary, and a recommendation. Written by the
 * signed-in scout, straight through RLS.
 */
export function ReportForm({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [observedOn, setObservedOn] = useState('');
  const [observedLive, setObservedLive] = useState(false);
  const [positionObserved, setPositionObserved] = useState('');
  const [minutesObserved, setMinutesObserved] = useState('');
  const [opposition, setOpposition] = useState('');
  const [technical, setTechnical] = useState(5);
  const [tactical, setTactical] = useState(5);
  const [physical, setPhysical] = useState(5);
  const [mental, setMental] = useState(5);
  const [overall, setOverall] = useState(5);
  const [potential, setPotential] = useState(5);
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [summary, setSummary] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation>('UNDECIDED');
  const [isDraft, setIsDraft] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session has expired. Sign in again.');
      const { error } = await supabase.from('scouting_reports').insert({
        player_id: playerId,
        scout_id: auth.user.id,
        observed_on: observedOn || null,
        observed_live: observedLive,
        position_observed: positionObserved || null,
        minutes_observed: minutesObserved ? Number(minutesObserved) : null,
        opposition: opposition || null,
        technical,
        tactical,
        physical,
        mental,
        overall_rating: overall,
        potential_rating: potential,
        strengths: strengths || null,
        weaknesses: weaknesses || null,
        summary: summary || null,
        recommendation,
        is_draft: isDraft,
      });
      if (error) throw error;
      router.push(`/players/${playerId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the report.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Observed on">
          <input type="date" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Position observed">
          <input value={positionObserved} onChange={(e) => setPositionObserved(e.target.value)} placeholder="e.g. CB (right)" className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Minutes observed">
          <input type="number" min={0} max={130} value={minutesObserved} onChange={(e) => setMinutesObserved(e.target.value)} className={`${inputCls} data`} style={inputStyle} />
        </Field>
        <Field label="Opposition">
          <input value={opposition} onChange={(e) => setOpposition(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={observedLive} onChange={(e) => setObservedLive(e.target.checked)} />
        Observed live in the stadium
      </label>

      <div>
        <p className="eyebrow mb-2">Pillars · 1–10</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RatingInput label="Technical" value={technical} onChange={setTechnical} />
          <RatingInput label="Tactical" value={tactical} onChange={setTactical} />
          <RatingInput label="Physical" value={physical} onChange={setPhysical} />
          <RatingInput label="Mental" value={mental} onChange={setMental} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <RatingInput label="Overall" value={overall} onChange={setOverall} />
        <RatingInput label="Potential" value={potential} onChange={setPotential} />
      </div>

      <Field label="Strengths">
        <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} className={`${inputCls} resize-y`} style={inputStyle} />
      </Field>
      <Field label="Weaknesses">
        <textarea value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={2} className={`${inputCls} resize-y`} style={inputStyle} />
      </Field>
      <Field label="Summary">
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={`${inputCls} resize-y`} style={inputStyle} />
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Recommendation">
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value as Recommendation)}
            className={inputCls}
            style={inputStyle}
          >
            {RECOMMENDATIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
          Save as draft
        </label>
        <button
          type="submit"
          disabled={busy}
          className="ml-auto px-4 py-2.5 rounded-[3px] text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-verified)', color: '#06201C' }}
        >
          {busy ? 'Saving…' : 'Save report'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs" style={{ color: 'var(--color-conflict)' }}>{error}</p>
      )}
    </form>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-[3px]';
const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">{label}</span>
      {children}
    </label>
  );
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1">
        {label} <span className="data font-semibold" style={{ color: 'var(--fg)' }}>{value}</span>
      </span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label={`${label} rating, 1 to 10`}
      />
    </label>
  );
}
