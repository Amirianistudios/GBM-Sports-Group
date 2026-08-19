'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/discover', label: 'Discover', icon: DiscoverIcon },
  { href: '/players', label: 'Players', icon: PlayersIcon },
  { href: '/watchlists', label: 'Watch', icon: WatchIcon },
  { href: '/data', label: 'Data', icon: DataIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bottom-safe"
      style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                /* 56px min target: this gets used one-handed, in a stand. */
                className="flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[0.625rem] font-semibold tracking-wide uppercase"
                style={{ color: active ? 'var(--color-verified-2)' : 'var(--muted)' }}
              >
                <Icon active={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { active?: boolean };
const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HomeIcon(_: IconProps) {
  return <svg {...S}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function DiscoverIcon(_: IconProps) {
  return <svg {...S}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>;
}
function PlayersIcon(_: IconProps) {
  return <svg {...S}><circle cx="12" cy="7" r="3.25" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>;
}
function WatchIcon(_: IconProps) {
  return <svg {...S}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" /></svg>;
}
function DataIcon(_: IconProps) {
  return <svg {...S}><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" /><path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" /></svg>;
}
