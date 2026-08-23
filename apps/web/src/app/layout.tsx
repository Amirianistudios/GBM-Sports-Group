import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Noto_Sans, Noto_Sans_Georgian } from 'next/font/google';
import { getLocale, UNCASED_SCRIPTS } from '@/lib/i18n';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  // Cyrillic here as well: the mono face carries dates and IDs, and a Russian
  // month abbreviation inside a `.data` span would otherwise drop to a system
  // font mid-line.
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/**
 * Archivo covers Latin, latin-ext and Vietnamese — and neither Georgian nor
 * Cyrillic. Without these two faces the Russian interface falls to whatever
 * sans-serif the device happens to have, and the Georgian interface risks
 * rendering as tofu boxes. Loading them is what makes those translations
 * actually legible rather than merely present.
 *
 * `preload: false` on both: the browser fetches a face only once a glyph on
 * the page needs it, so an English session pays nothing for the two scripts it
 * will never draw. The per-glyph fallback in the CSS stack does the routing.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['georgian'],
  variable: '--font-noto-georgian',
  display: 'swap',
  preload: false,
});

const notoCyrillic = Noto_Sans({
  subsets: ['cyrillic'],
  variable: '--font-noto-cyrillic',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'GBM Intelligence',
  description: 'Football scouting and talent intelligence for GBM Sports Group.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GBM',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDF0EE' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1419' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      // `data-uncased` marks a script with no capital letters, so the
      // stylesheet can drop the uppercase transform and the wide tracking that
      // eyebrow labels use for Latin. Applied to the element rather than
      // branched in every component.
      data-uncased={UNCASED_SCRIPTS.has(locale) ? '' : undefined}
      className={`${archivo.variable} ${plexMono.variable} ${notoGeorgian.variable} ${notoCyrillic.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
