import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

/** How a stored role reads on screen. */
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner · Licensed Football Agent',
  EXECUTIVE_DIRECTOR: 'Executive Director',
  PLAYER_SERVICE_SCOUT: 'Player Service · Scout',
  ADMIN: 'Administrator',
  SCOUT: 'Scout',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

/**
 * GBM SPORTS GROUP — the organization behind the platform.
 * Real people, real roles, nothing invented: no biographies or credentials
 * appear here that the organization has not supplied. Role-based platform
 * administration arrives in the next phase.
 */
const TEAM = [
  {
    name: 'Mame Amirov',
    role: 'Owner · Licensed Football Agent',
    focus: 'Representation, negotiations and the agency mandate.',
  },
  {
    name: 'Giorgi Amoev Baravi',
    role: 'Executive Director',
    focus: 'Operations and club relationships.',
  },
  {
    name: 'Antoni Amirian',
    role: 'Player Service · Scout',
    focus: 'Player support and scouting across the tracked market.',
  },
] as const;

export default async function TeamPage() {
  // The roles shown are the roles the database actually enforces, read through
  // the signed-in user's own client. A page that hard-codes them would drift
  // from the permissions silently.
  const supabase = await createClient();
  const { data: members } = await supabase
    .from('organization_members')
    .select('role, profiles:user_id(full_name, email)');

  const roleByName = new Map<string, string>();
  for (const m of members ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = m as any;
    const name = row.profiles?.full_name as string | undefined;
    if (name) roleByName.set(name, row.role as string);
  }

  return (
    <AppShell eyebrow="Organization" title="Team">
      <section className="px-4 md:px-6 pt-4">
        <div className="card p-5 md:p-6 mb-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gbm-logo.png" alt="" width={56} height={56} className="rounded-[8px]" />
            <div>
              <h2 className="text-xl font-bold tracking-tight">GBM Sports Group</h2>
              <p className="eyebrow mt-1" style={{ letterSpacing: '0.06em' }}>
                Elevating Careers · Building Legacies
              </p>
            </div>
          </div>
          <p className="text-sm mt-4 leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
            A football agency built on verifiable information. GBM Intelligence is the group&#8217;s
            internal platform: every fact on it traces to a source, and scouting opinion is always
            kept distinct from provider data.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m) => (
            <div key={m.name} className="card card-interactive p-5">
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-[6px] flex items-center justify-center font-bold text-lg mb-3"
                style={{ background: 'var(--color-gbm)', color: '#14100A', letterSpacing: '0.02em' }}
              >
                {m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
              </div>
              <h3 className="font-bold text-[1.0625rem] tracking-tight">{m.name}</h3>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-verified-2)' }}>
                {roleByName.has(m.name) ? ROLE_LABEL[roleByName.get(m.name)!] ?? m.role : m.role}
              </p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>{m.focus}</p>
              <p className="eyebrow mt-3">
                {roleByName.has(m.name) ? 'Account active' : 'No account yet'}
              </p>
            </div>
          ))}
        </div>

        <p className="text-xs mt-4 leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
          Roles shown here are the roles the database enforces. The owner manages the portfolio,
          staff and guardian information for minors; the executive director manages the portfolio
          and scouting; player service and scouting covers discovery, watchlists, reports and
          notes. Guardian details for under-18s are restricted by database policy, not by hiding
          them on screen.
        </p>
      </section>
      <div className="h-8" />
    </AppShell>
  );
}
