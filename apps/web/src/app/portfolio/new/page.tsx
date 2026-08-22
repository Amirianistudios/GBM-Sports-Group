import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { AddPlayerForm } from './add-player-form';

export const dynamic = 'force-dynamic';

/**
 * ADD PLAYER — the only way a player enters GBM's portfolio by hand.
 *
 * The gate is checked here for a civil experience and enforced again by RLS on
 * every write. Staff options come from the organisation's real membership, so
 * "responsible" can only ever name a real colleague.
 */
export default async function NewPortfolioPlayerPage() {
  const supabase = await createClient();

  const { data: canManage } = await supabase.rpc('gbm_can_manage_portfolio');
  if (canManage !== true) redirect('/portfolio');

  const [{ data: staff }, { data: canSeeGuardian }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id, role, profiles:user_id(full_name, email)')
      .order('role'),
    supabase.rpc('gbm_can_view_guardian_data'),
  ]);

  const staffOptions = (staff ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = s as any;
    return {
      id: row.user_id as string,
      name: (row.profiles?.full_name as string) ?? (row.profiles?.email as string) ?? 'Unnamed',
      role: row.role as string,
    };
  });

  return (
    <AppShell eyebrow="GBM · Portfolio" title="Add player">
      <div className="px-4 md:px-6 pt-3">
        <p className="text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
          Only a name is required. Leave anything you do not yet know empty — a blank field is
          honest, a guessed one is not. Entering a date of birth under 18 opens the guardian
          section, which only the owner and executive director can read.
        </p>
        <Link href="/portfolio" className="text-xs font-semibold inline-block mt-2"
              style={{ color: 'var(--color-verified-2)' }}>
          ← Back to portfolio
        </Link>
      </div>
      <AddPlayerForm staff={staffOptions} canSeeGuardian={canSeeGuardian === true} />
      <div className="h-10" />
    </AppShell>
  );
}
