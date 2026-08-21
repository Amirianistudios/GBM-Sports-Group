import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * SETTINGS — account and session, honestly scoped.
 * Role management, team administration and preferences arrive with the
 * user-roles phase; until then this page shows the signed-in identity and
 * the sign-out action rather than pretending controls exist.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name, email, created_at').eq('id', user.id).maybeSingle()
    : { data: null };

  return (
    <AppShell eyebrow="Organization" title="Settings">
      <section className="px-4 md:px-6 pt-4 max-w-xl">
        <div className="card overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="eyebrow">Signed in as</p>
            <p className="font-semibold text-[0.9375rem] mt-1">{profile?.full_name ?? user?.email ?? '—'}</p>
            <p className="data text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email}</p>
          </div>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="eyebrow">Member since</p>
            <p className="data text-sm mt-1">{formatDate(profile?.created_at ?? user?.created_at)}</p>
          </div>
          <form action="/auth/signout" method="post" className="px-4 py-3">
            <button
              type="submit"
              className="px-3 py-2 rounded-[4px] text-sm font-semibold"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--color-conflict)' }}
            >
              Sign out
            </button>
          </form>
        </div>

        <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
          Accounts are created by a GBM administrator — there is no public sign-up. Role management
          and team administration arrive in the next phase.
        </p>
      </section>
      <div className="h-8" />
    </AppShell>
  );
}
