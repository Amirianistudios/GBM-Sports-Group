'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

/**
 * URL-synced tabs (?tab=) — one server fetch renders every panel into the
 * payload, the client switches instantly and the URL stays deep-linkable.
 * No per-tab refetching, no layout jump. Panels arrive as ReactNodes because
 * functions cannot cross the server/client boundary.
 */
export function Tabs({
  tabs,
  defaultTab,
  panels,
}: {
  tabs: Array<{ id: string; label: string }>;
  defaultTab: string;
  panels: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const requested = params.get('tab');
  const active = tabs.some((t) => t.id === requested) ? (requested as string) : defaultTab;

  function select(id: string) {
    const p = new URLSearchParams(params.toString());
    if (id === defaultTab) p.delete('tab');
    else p.set('tab', id);
    startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false }));
  }

  return (
    <div>
      <div className="tab-bar px-4 md:px-6 sticky top-[49px] z-20" style={{ background: 'var(--bg)' }} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            className="tab"
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panels[active]}</div>
    </div>
  );
}
