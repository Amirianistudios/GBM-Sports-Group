import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

/**
 * 404 inside the shell — a mistyped player id or a stale link should leave
 * the user in the app with the navigation intact, not on a bare error page.
 */
export default function NotFound() {
  return (
    <AppShell eyebrow="GBM Intelligence" title="Not found">
      <section className="px-4 md:px-6 pt-6">
        <div className="card p-6 max-w-lg">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            Nothing lives at this address. If a player link brought you here, the profile may have
            been merged into another — search for the name instead.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/players"
              className="px-4 min-h-[44px] inline-flex items-center rounded-[4px] text-sm font-semibold"
              style={{ background: 'var(--color-verified)', color: '#06201C' }}
            >
              Browse players
            </Link>
            <Link
              href="/"
              className="px-4 min-h-[44px] inline-flex items-center rounded-[4px] text-sm font-semibold"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--fg)' }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
