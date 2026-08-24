import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';

/**
 * CLUBS — the whole register, not the first page of it.
 *
 * This page used to `.limit(200)` and then print `clubs.length` as the count,
 * so it announced "200 clubs" no matter how many existed. With 806 in the
 * database that was wrong twice over: it hid three quarters of them, and it
 * stated the page size as though it were the total.
 *
 * A club register is something you arrive at looking for one club, so search
 * comes first and paging carries the rest. The count is a real COUNT — cheap
 * here, because `clubs` is a small indexed table rather than a computed view.
 */

const PAGE_SIZE = 100;

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function ClubsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('clubs')
    .select('id, name, city, players(count)', { count: 'exact' })
    .order('name')
    .range(from, from + PAGE_SIZE - 1);

  // Matching the city as well as the name is what makes the box useful for
  // "that club in Ghent" — the case where the exact name is what you lack.
  // The comma inside or() is the separator, so a comma typed by the user
  // would split the filter; strip it rather than build a broken query.
  if (q) {
    const safe = q.replace(/[,()]/g, ' ').trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }

  const { data: clubs, count, error } = await query;

  if (error) console.error(`[clubs] read failed — ${error.message}`);

  const total = count ?? 0;
  const shown = (clubs ?? []).length;
  const hasNext = from + shown < total;
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `/clubs?${s}` : '/clubs';
  };

  return (
    <AppShell eyebrow="Research" title="Clubs">
      <form method="GET" action="/clubs" className="px-4 md:px-6 pt-3 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by club or city"
          aria-label="Search clubs by name or city"
          className="input flex-1"
        />
        <button type="submit" className="badge badge-neutral !px-3 !py-2 !text-xs">
          Search
        </button>
        {q && (
          <Link href="/clubs" className="badge badge-neutral !px-3 !py-2 !text-xs">
            Clear
          </Link>
        )}
      </form>

      <p className="px-4 md:px-6 pt-3 eyebrow">
        {q
          ? `${total.toLocaleString('en-GB')} matching “${q}”`
          : `${total.toLocaleString('en-GB')} clubs`}
        {total > PAGE_SIZE && ` · showing ${from + 1}–${from + shown}`}
      </p>

      <div className="surface mx-4 md:mx-6 mt-2 overflow-hidden">
        {shown === 0 ? (
          <p className="px-4 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
            {q ? `No club matches “${q}”.` : 'No clubs loaded yet.'}
          </p>
        ) : (
          (clubs ?? []).map((c) => {
            const squad = Array.isArray(c.players) ? (c.players[0]?.count ?? 0) : 0;
            return (
              <Link
                key={c.id}
                href={`/players?club=${encodeURIComponent(c.name)}`}
                className="sheet-row"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[0.9375rem] truncate">{c.name}</p>
                    {c.city && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                        {c.city}
                      </p>
                    )}
                  </div>
                  {/* A zero is worth showing: it says the club is known but no
                      tracked player is at it, which is different from unknown. */}
                  <span className="data text-sm shrink-0" style={{ color: 'var(--muted)' }}>
                    {squad}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Pagination page={page} hasNext={hasNext} makeHref={makeHref} />
      <div className="h-8" />
    </AppShell>
  );
}
