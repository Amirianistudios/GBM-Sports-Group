'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLocale, LOCALE_COOKIE, DEFAULT_LOCALE } from '@/lib/i18n';

/**
 * Set the interface language.
 *
 * The value is validated against the locale list rather than trusted: this
 * writes a cookie the server reads on every subsequent request, so an
 * unchecked value from a form post would be stored and echoed back. An
 * unrecognised locale falls back to the default instead of erroring — the
 * only way to reach that branch is a hand-crafted request, and the useful
 * response to one is a working interface in English.
 *
 * The cookie is deliberately not `httpOnly`: it holds a display preference,
 * carries no authority, and being readable by the page is what would let a
 * future client-side control read the current choice without a round trip.
 * It is `sameSite: 'lax'` and one year long, so the choice survives the
 * session — a Georgian speaker should not have to re-pick the language every
 * time they sign in.
 */
export async function setLanguage(formData: FormData): Promise<void> {
  const requested = formData.get('locale');
  const candidate = typeof requested === 'string' ? requested : null;
  const locale = isLocale(candidate) ? candidate : DEFAULT_LOCALE;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });

  // Every page reads the locale, so the whole tree is stale, not just this
  // route. Without this the user changes the language and the navigation they
  // are looking at stays in the old one until the next hard navigation.
  revalidatePath('/', 'layout');
}
