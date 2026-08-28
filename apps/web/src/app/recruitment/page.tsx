import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { RequirementForm } from './requirement-form';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * RECRUITMENT INTELLIGENCE — a club states a need, the platform ranks who fits.
 *
 * The list is deliberately plain. The interesting screen is the one behind a
 * requirement, and a register of open briefs is a thing you scan for the one
 * you came for, not a thing to decorate.
 */

interface Row {
  id: string;
  title: string | null;
  club_name: string | null;
  position_required: string;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  transfer_budget_max: number | null;
  urgency: string | null;
  status: string;
  created_at: string;
}

const URGENCY_LABEL: Record<string, string> = {
  IMMEDIATE: 'Immediate',
  THIS_WINDOW: 'This window',
  NEXT_WINDOW: 'Next window',
  MONITORING: 'Monitoring',
};

export default async function RecruitmentPage() {
  const supabase = await createClient();

  const [{ data: requirements, error }, { data: canWrite }] = await Promise.all([
    supabase
      .from('recruitment_requests')
      // One string literal, not a concatenation: Supabase infers the row type
      // from the literal, and joining two pieces collapses it to
      // GenericStringError.
      .select('id, title, club_name, position_required, preferred_age_min, preferred_age_max, transfer_budget_max, urgency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.rpc('gbm_can_write'),
  ]);

  if (error) console.error(`[recruitment] read failed — ${error.message}`);
  const rows = (requirements ?? []) as Row[];

  return (
    <AppShell eyebrow="GBM" title="Recruitment intelligence">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        A club states what it needs and the platform ranks who fits, from stored
        data only. Every recommendation carries how much of it the platform
        could actually see — a strong score on a thin record is not the same
        recommendation as a strong score on a complete one.
      </p>

      {canWrite === true && <RequirementForm />}

      <section className="px-4 md:px-6 mt-6">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">
          Open requirements
        </h2>
        <div className="surface overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No club requirement yet.
              {canWrite === true
                ? ' Create one above and the ranking runs immediately.'
                : ' Ask the executive director to create one.'}
            </p>
          ) : (
            rows.map((r) => (
              <Link key={r.id} href={`/recruitment/${r.id}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <span className="badge badge-neutral shrink-0">{r.position_required}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[0.9375rem] truncate">
                      {r.title ?? `${r.position_required} required`}
                      {r.club_name && (
                        <span className="font-normal" style={{ color: 'var(--muted)' }}>
                          {' · '}
                          {r.club_name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                      {[
                        r.preferred_age_min !== null || r.preferred_age_max !== null
                          ? `Age ${r.preferred_age_min ?? '?'}–${r.preferred_age_max ?? '?'}`
                          : null,
                        r.transfer_budget_max !== null
                          ? `to ${formatCurrency(r.transfer_budget_max)}`
                          : null,
                        r.urgency ? URGENCY_LABEL[r.urgency] ?? r.urgency : null,
                        formatDate(r.created_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {r.status !== 'OPEN' && (
                    <span className="badge badge-neutral shrink-0">{r.status.toLowerCase()}</span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
      <div className="h-8" />
    </AppShell>
  );
}
