'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Grid/list switch, persisted in the URL (?view=) so it survives refresh,
 * sharing and back-navigation. List is the high-volume default.
 */
export function ViewToggle({ labels }: { labels: { list: string; grid: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const view = params.get('view') === 'grid' ? 'grid' : 'list';

  function set(next: 'grid' | 'list') {
    const p = new URLSearchParams(params.toString());
    if (next === 'list') p.delete('view');
    else p.set('view', next);
    startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false }));
  }

  return (
    <div
      className="inline-flex rounded-[5px] p-0.5"
      style={{ background: 'color-mix(in srgb, var(--fg) 6%, transparent)', opacity: pending ? 0.6 : 1 }}
      role="group"
      aria-label={`${labels.list} / ${labels.grid}`}
    >
      {(['list', 'grid'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={view === v}
          className="px-2.5 py-1 text-xs font-semibold rounded-[4px] transition-colors"
          style={{
            background: view === v ? 'var(--surface)' : 'transparent',
            color: view === v ? 'var(--fg)' : 'var(--muted)',
            boxShadow: view === v ? 'var(--shadow-0)' : 'none',
          }}
        >
          {v === 'list' ? labels.list : labels.grid}
        </button>
      ))}
    </div>
  );
}
