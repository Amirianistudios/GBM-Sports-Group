'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_GROUPS, isActivePath } from './side-nav';

/**
 * Purpose-built mobile navigation: four primary destinations plus a Menu
 * sheet holding the complete map — the desktop sidebar is never squeezed
 * onto a phone. 56px targets; safe-area aware.
 */
const PRIMARY = [
  { href: '/', label: 'Dashboard', icon: HomeIcon },
  { href: '/discover', label: 'Discover', icon: RadarIcon },
  { href: '/players', label: 'Players', icon: PlayersIcon },
  { href: '/watchlists', label: 'Watch', icon: WatchIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Route change closes the sheet — state adjusted during render (the React
  // derive-from-props pattern), not in an effect, so no cascading render.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // While the sheet is open, the page behind must not scroll.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const primaryHrefs = PRIMARY.map((p) => p.href);
  const menuActive = !primaryHrefs.some((h) => isActivePath(pathname, h));

  return (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex flex-col"
          style={{ background: 'var(--bg)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/gbm-logo.png" alt="" width={24} height={24} className="rounded-[4px]" />
              <span className="font-bold tracking-tight text-[0.9375rem]">GBM Intelligence</span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="px-3 py-1.5 text-sm font-semibold"
              style={{ color: 'var(--muted)' }}
            >
              Close
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="All sections">
            {NAV_GROUPS.map((group) => (
              <div key={group.heading} className="mb-5">
                <p className="eyebrow mb-1.5">{group.heading}</p>
                <ul className="surface overflow-hidden">
                  {group.items.map(({ href, label }) => {
                    const active = isActivePath(pathname, href);
                    return (
                      <li key={href} style={{ borderBottom: '1px solid var(--border)' }} className="last:border-b-0">
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className="flex items-center justify-between px-4 py-3 text-[0.9375rem] font-medium"
                          style={{ color: active ? 'var(--color-verified-2)' : 'var(--fg)' }}
                        >
                          {label}
                          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <form action="/auth/signout" method="post" className="mb-8">
              <button
                type="submit"
                className="w-full surface px-4 py-3 text-left text-[0.9375rem] font-medium"
                style={{ color: 'var(--muted)' }}
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      )}

      <nav
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bottom-safe"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5">
          {PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  /* 56px min target: this gets used one-handed, in a stand. */
                  className="flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[0.625rem] font-semibold tracking-wide uppercase"
                  style={{ color: active ? 'var(--color-verified-2)' : 'var(--muted)' }}
                >
                  <Icon />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              className="w-full flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[0.625rem] font-semibold tracking-wide uppercase"
              style={{ color: menuActive ? 'var(--color-verified-2)' : 'var(--muted)' }}
            >
              <MenuIcon />
              Menu
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HomeIcon() {
  return <svg {...S}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function RadarIcon() {
  return <svg {...S}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-6" /></svg>;
}
function PlayersIcon() {
  return <svg {...S}><circle cx="12" cy="7" r="3.25" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>;
}
function WatchIcon() {
  return <svg {...S}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" /></svg>;
}
function MenuIcon() {
  return <svg {...S}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>;
}
