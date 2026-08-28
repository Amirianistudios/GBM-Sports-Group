'use client';

import Link from 'next/link';

/**
 * Route-level error boundary. Without one, an unhandled server throw dropped
 * the user onto Next's bare error screen — outside the shell, with no
 * navigation and no way back but the browser. Error boundaries must be client
 * components, so this styles itself with the same tokens rather than
 * importing the (server) AppShell.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <p className="eyebrow">GBM Intelligence</p>
      <h1 className="text-xl font-semibold tracking-tight mt-2">Something broke on this page</h1>
      <p className="text-sm mt-2 max-w-md leading-relaxed" style={{ color: 'var(--muted)' }}>
        The error is recorded{error.digest ? ` (ref ${error.digest})` : ''}. Nothing you did caused
        it, and your data is unaffected — try again, or go back to the dashboard.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 min-h-[44px] rounded-[4px] text-sm font-semibold"
          style={{ background: 'var(--color-verified)', color: '#06201C' }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-4 min-h-[44px] inline-flex items-center rounded-[4px] text-sm font-semibold"
          style={{ border: '1px solid var(--border-strong)', color: 'var(--fg)' }}
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
