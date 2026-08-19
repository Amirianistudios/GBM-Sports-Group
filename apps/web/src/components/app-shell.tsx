import Link from 'next/link';
import { BottomNav } from './bottom-nav';
import { SideNav } from './side-nav';

export function AppShell({
  children,
  title,
  eyebrow,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:flex">
      <SideNav />

      <div className="flex-1 min-w-0">
        <header
          className="sticky top-0 z-30 backdrop-blur"
          style={{
            background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="px-4 md:px-6 py-3 flex items-center gap-3">
            <Link href="/" className="md:hidden flex items-baseline gap-1.5 shrink-0">
              <span className="font-bold tracking-tight text-[0.9375rem]">GBM</span>
              <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>Intelligence</span>
            </Link>
            <div className="min-w-0 flex-1 md:flex md:items-baseline md:gap-3">
              {eyebrow && <p className="eyebrow hidden md:block">{eyebrow}</p>}
              {title && (
                <h1 className="hidden md:block text-lg font-semibold tracking-tight truncate">
                  {title}
                </h1>
              )}
            </div>
            {action}
          </div>
          {title && (
            <div className="md:hidden px-4 pb-3">
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            </div>
          )}
        </header>

        <main className="pb-safe md:pb-10">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
