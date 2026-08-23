import { cookies, headers } from 'next/headers';
import { en, type Dict, type MessageKey } from './en';
import { ru } from './ru';
import { nl } from './nl';
import { ka } from './ka';

/**
 * Localisation, with no dependency added.
 *
 * `apps/web` installs standalone — Vercel's Root Directory may be the repo
 * root or this directory — so every dependency here is a deployment risk for
 * no functional gain. Four dictionaries, a cookie and an interpolator are the
 * whole feature; a library would add a build step and a routing convention to
 * do the same thing.
 *
 * The locale lives in a cookie rather than a URL segment on purpose. This is a
 * private, authenticated tool: nothing is indexed, no one shares a Russian
 * deep link, and putting /ru/ in front of every route would rewrite the entire
 * routing tree and every internal href for a preference that belongs to a
 * person, not to a page.
 */

export const LOCALES = ['en', 'ru', 'nl', 'ka'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie name. Read by the server on every request; set by the switcher. */
export const LOCALE_COOKIE = 'gbm-locale';

const DICTS: Record<Locale, Dict> = { en, ru, nl, ka };

/**
 * Georgian is written in Mkhedruli, which has no upper case. The design system
 * sets `text-transform: uppercase` with wide tracking on eyebrow labels, which
 * does nothing to Georgian letterforms but does pull them apart until they
 * stop reading as words. `<html>` carries the locale so CSS can undo it.
 */
export const UNCASED_SCRIPTS: ReadonlySet<Locale> = new Set<Locale>(['ka']);

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best locale for this request: an explicit choice wins, then the browser's
 * Accept-Language, then English. Parsing Accept-Language properly (q-values,
 * regional subtags like nl-BE) matters here — GBM's own staff are in Belgium
 * and Georgia, so `nl-BE` and `ka-GE` are the common cases and a naive exact
 * match would send both to English.
 */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const header = (await headers()).get('accept-language');
  return localeFromAcceptLanguage(header);
}

/** Exported for tests: the header parse has more edge cases than it looks. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    // `nl-BE` and `ka-GE` must resolve to nl and ka.
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * The translator for a request. Returns both the locale and `t`, because a
 * caller almost always needs the locale too — for `<html lang>`, for
 * `toLocaleString`, or to decide a date format.
 */
export async function getTranslator(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Pure translator for a locale — the part that is unit-testable without a
 * request. Falls back to English for a key that is somehow absent at runtime
 * (it cannot be, since every locale is typed as `Dict`, but a fallback that
 * shows English beats one that shows `undefined` to a client).
 */
export function translator(locale: Locale): Translate {
  const dict = DICTS[locale] ?? en;
  return (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars);
}

/**
 * `{name}` substitution. A placeholder with no matching variable is left
 * verbatim rather than replaced with an empty string: a visible `{count}` in
 * the interface is a bug report, whereas a silent gap is a mystery.
 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Elapsed time in the reader's language, for `freshness()`.
 *
 * Kept here rather than in freshness.ts so the cadence logic stays free of
 * translation concerns and this stays the one place a language is chosen.
 */
export function elapsedIn(t: Translate): (minutes: number) => string {
  return (minutes) => {
    if (minutes < 1) return t('common.justNow');
    if (minutes < 60) return t('common.minutesAgo', { count: Math.round(minutes) });
    const hours = minutes / 60;
    if (hours < 24) return t('common.hoursAgo', { count: Math.round(hours) });
    return t('common.daysAgo', { count: Math.round(hours / 24) });
  };
}

export { en, ru, nl, ka };
export type { Dict, MessageKey };
