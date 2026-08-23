import Link from 'next/link';
import { BottomNav } from './bottom-nav';
import { SideNav } from './side-nav';
import { NAV_GROUPS, type NavLabels } from '@/lib/nav';
import { getTranslator, type Translate } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/en';

/**
 * The shell resolves navigation strings once per request and hands finished
 * labels to the two client navs. They need `usePathname`, so they cannot read
 * the locale themselves; doing the lookup here keeps four dictionaries out of
 * the client bundle and leaves the navs unaware that translation exists.
 */
const CHROME_KEYS: MessageKey[] = [
  'brand.name',
  'brand.product',
  'brand.org',
  'nav.signout',
  'nav.menu',
  'nav.primary',
  'common.cancel',
];

function navLabels(t: Translate): NavLabels {
  const labels: NavLabels = {};
  for (const key of CHROME_KEYS) labels[key] = t(key);
  for (const group of NAV_GROUPS) {
    labels[group.headingKey] = t(group.headingKey);
    for (const item of group.items) labels[item.labelKey] = t(item.labelKey);
  }
  // Reachable from the phone tab bar but not from any sidebar group.
  labels['nav.watch'] = t('nav.watch');
  return labels;
}

export async function AppShell({
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
  const { t } = await getTranslator();
  const labels = navLabels(t);

  return (
    <div className="min-h-dvh md:flex">
      <SideNav labels={labels} />

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
              <span className="font-bold tracking-tight text-[0.9375rem]">{labels['brand.name']}</span>
              <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                {labels['brand.product']}
              </span>
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

      <BottomNav labels={labels} />
    </div>
  );
}
