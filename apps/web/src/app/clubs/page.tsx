import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function ClubsPage() {
  const supabase = await createClient();

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, city, players(count)')
    .order('name')
    .limit(200);

  return (
    <AppShell eyebrow="Research" title="Clubs">
      <p className="px-4 md:px-6 pt-3 eyebrow">{clubs?.length ?? 0} clubs</p>
      <div className="surface mx-4 md:mx-6 mt-2 overflow-hidden">
        {(clubs ?? []).length === 0 ? (
          <p className="px-4 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
            No clubs loaded yet.
          </p>
        ) : (
          (clubs ?? []).map((c) => {
            const count = Array.isArray(c.players) ? (c.players[0]?.count ?? 0) : 0;
            return (
              <Link key={c.id} href={`/players?club=${encodeURIComponent(c.name)}`} className="sheet-row">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[0.9375rem] truncate">{c.name}</p>
                    {c.city && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{c.city}</p>
                    )}
                  </div>
                  <span className="data text-sm shrink-0" style={{ color: 'var(--muted)' }}>
                    {count}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
      <div className="h-8" />
    </AppShell>
  );
}
