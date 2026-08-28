import type { MessageKey } from '@/lib/i18n/en';

/**
 * The navigation map and its path matching — plain data, in a plain module.
 *
 * This lived in `side-nav.tsx` until the shell needed to read it. That file is
 * `'use client'`, and a value imported from a client module into a Server
 * Component arrives as a client reference proxy, not as the value: the array
 * was there at build time and `NAV_GROUPS is not iterable` at request time.
 * Nothing type-checks its way out of that, because the types are correct — it
 * is the module boundary that changes what the export is.
 *
 * So the map lives here, with no directive, and both sides import it: the
 * server shell to resolve labels, the client navs to render them.
 */
export const NAV_GROUPS: Array<{
  headingKey: MessageKey;
  items: Array<{ href: string; labelKey: MessageKey }>;
}> = [
  {
    headingKey: 'nav.group.intelligence',
    items: [
      { href: '/', labelKey: 'nav.dashboard' },
      { href: '/discover', labelKey: 'nav.discover' },
      { href: '/radar', labelKey: 'nav.radar' },
      { href: '/trends', labelKey: 'nav.trends' },
    ],
  },
  {
    headingKey: 'nav.group.scouting',
    items: [
      { href: '/players', labelKey: 'nav.players' },
      { href: '/compare', labelKey: 'nav.compare' },
      { href: '/clubs', labelKey: 'nav.clubs' },
    ],
  },
  {
    headingKey: 'nav.group.gbm',
    items: [
      { href: '/recruitment', labelKey: 'nav.recruitment' },
      { href: '/portfolio', labelKey: 'nav.portfolio' },
      { href: '/representation', labelKey: 'nav.representation' },
      { href: '/watchlists', labelKey: 'nav.watchlists' },
      { href: '/scouting', labelKey: 'nav.scouting' },
    ],
  },
  {
    headingKey: 'nav.group.organization',
    items: [
      { href: '/team', labelKey: 'nav.team' },
      { href: '/data', labelKey: 'nav.data' },
      { href: '/data/sync', labelKey: 'nav.sync' },
      { href: '/data/quality', labelKey: 'nav.quality' },
      { href: '/settings', labelKey: 'nav.settings' },
    ],
  },
];

/** Finished strings, resolved once per request by the server shell. */
export type NavLabels = Record<string, string>;

/**
 * Is this nav entry the current page? `/` matches only itself — every path
 * starts with it — while every other entry also owns its subtree, so
 * `/players/<id>` keeps Players highlighted.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single entry to highlight among sibling nav items: the longest matching
 * href wins. Prefix matching alone lit both `/data` and `/data/sync` while on
 * the sync page — two "current pages" at once.
 */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isActivePath(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
