'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS: Array<{ heading: string; items: Array<{ href: string; label: string }> }> = [
  {
    heading: 'Intelligence',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/discover', label: 'Discover' },
      { href: '/representation', label: 'Representation' },
    ],
  },
  {
    heading: 'Research',
    items: [
      { href: '/players', label: 'Players' },
      { href: '/compare', label: 'Compare' },
      { href: '/clubs', label: 'Clubs' },
    ],
  },
  {
    heading: 'GBM',
    items: [
      { href: '/watchlists', label: 'Watchlists' },
      { href: '/scouting', label: 'Scouting' },
    ],
  },
  {
    heading: 'System',
    items: [{ href: '/data', label: 'Data & providers' }],
  },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 lg:w-64 shrink-0 sticky top-0 h-dvh"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      <Link href="/" className="px-5 py-5 block">
        <div className="flex items-center gap-2.5">
          {/* The GBM wordmark — monochrome by brand; see docs/GBM_BRAND_ANALYSIS.md */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gbm-logo.png"
            alt="GBM Sports Group"
            width={34}
            height={34}
            className="rounded-[4px] shrink-0"
          />
          <div className="flex flex-col leading-none gap-1">
            <span className="text-base font-bold tracking-tight">GBM</span>
            <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>Intelligence</span>
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-6" aria-label="Primary">
        {GROUPS.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="eyebrow px-3 mb-1.5">{group.heading}</p>
            <ul>
              {group.items.map(({ href, label }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className="block px-3 py-2 text-sm rounded-[3px] font-medium"
                      style={{
                        background: active
                          ? 'color-mix(in srgb, var(--color-verified) 12%, transparent)'
                          : 'transparent',
                        color: active ? 'var(--color-verified-2)' : 'var(--fg)',
                      }}
                    >
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
          className="w-full text-left px-3 py-2 text-sm rounded-[3px]"
          style={{ color: 'var(--muted)' }}
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
