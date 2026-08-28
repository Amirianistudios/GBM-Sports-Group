'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

/**
 * URL-synced tabs (?tab=) — one server fetch renders every panel into the
 * payload, the client switches instantly and the URL stays deep-linkable.
 * No per-tab refetching, no layout jump. Panels arrive as ReactNodes because
 * functions cannot cross the server/client boundary.
 *
 * The bar sticks only from md up: the desktop header is one 49px row, but on
 * phones the title wraps to a second row of variable height, and a bar stuck
 * at a desktop offset slid underneath it.
 *
 * Keyboard contract: arrow keys move between tabs (roving tabIndex), each tab
 * names its panel via aria-controls, and the panel points back with
 * aria-labelledby — without those, a screen reader announces "tab" with no
 * idea what it switches.
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

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div
        className="tab-bar px-4 md:px-6 md:sticky md:top-[49px] z-20"
        style={{ background: 'var(--bg)' }}
        role="tablist"
        onKeyDown={onKey}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className="tab"
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {panels[active]}
      </div>
    </div>
  );
}
