'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_GROUPS: Array<{ heading: string; items: Array<{ href: string; label: string }> }> = [
  {
    heading: 'Intelligence',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/discover', label: 'Discover' },
      { href: '/radar', label: 'Market Radar' },
      { href: '/trends', label: 'Trends' },
    ],
  },
  {
    heading: 'Scouting',
    items: [
      { href: '/players', label: 'Players' },
      { href: '/compare', label: 'Compare' },
      { href: '/clubs', label: 'Clubs' },
    ],
  },
  {
    heading: 'GBM',
    items: [
      { href: '/portfolio', label: 'Portfolio' },
      { href: '/watchlists', label: 'Watchlists' },
      { href: '/scouting', label: 'Scouting Reports' },
    ],
  },
  {
    heading: 'Organization',
    items: [
      { href: '/team', label: 'Team' },
      { href: '/data', label: 'Data Providers' },
      { href: '/data/sync', label: 'Sync Status' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
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
            alt="GBM Sports Group"
            width={30}
            height={30}
            className="rounded-[5px] shrink-0"
          />
          <div className="flex flex-col leading-none gap-1">
            <span className="text-[0.9375rem] font-bold tracking-tight">GBM</span>
            <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>Intelligence</span>
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-6" aria-label="Primary">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mt-4 first:mt-1">
            <p className="eyebrow px-2.5 mb-1" style={{ fontSize: '0.625rem' }}>{group.heading}</p>
            <ul>
              {group.items.map(({ href, label }) => {
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
                      {label}
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
          Sign out
        </button>
      </form>
    </aside>
  );
}
