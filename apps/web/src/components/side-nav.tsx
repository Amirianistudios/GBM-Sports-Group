'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, isActivePath, type NavLabels } from '@/lib/nav';

export function SideNav({ labels }: { labels: NavLabels }) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 lg:w-60 shrink-0 sticky top-0 h-dvh"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      <Link href="/" className="px-4 py-4 block">
        <div className="flex items-center gap-2.5">
          {/* The GBM wordmark — monochrome by brand; see docs/GBM_BRAND_ANALYSIS.md */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gbm-logo.png"
            alt={labels['brand.org']}
            width={30}
            height={30}
            className="rounded-[5px] shrink-0"
          />
          <div className="flex flex-col leading-none gap-1">
            <span className="text-[0.9375rem] font-bold tracking-tight">{labels['brand.name']}</span>
            <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>{labels['brand.product']}</span>
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-6" aria-label={labels['nav.primary']}>
        {NAV_GROUPS.map((group) => (
          <div key={group.headingKey} className="mt-4 first:mt-1">
            <p className="eyebrow px-2.5 mb-1" style={{ fontSize: '0.625rem' }}>
              {labels[group.headingKey]}
            </p>
            <ul>
              {group.items.map(({ href, labelKey }) => {
                const active = isActivePath(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className="flex items-center gap-2 px-2.5 py-[0.4375rem] text-[0.8125rem] rounded-[5px] font-medium transition-colors"
                      style={{
                        background: active
                          ? 'color-mix(in srgb, var(--color-verified) 10%, transparent)'
                          : 'transparent',
                        color: active ? 'var(--color-verified-2)' : 'var(--fg)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="w-1 h-1 rounded-full transition-opacity"
                        style={{
                          background: 'var(--color-verified)',
                          opacity: active ? 1 : 0,
                        }}
                      />
                      {labels[labelKey]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <form action="/auth/signout" method="post" className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          type="submit"
          className="w-full text-left px-2.5 py-2 text-[0.8125rem] rounded-[5px] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
          style={{ color: 'var(--muted)' }}
        >
          {labels['nav.signout']}
        </button>
      </form>
    </aside>
  );
}
