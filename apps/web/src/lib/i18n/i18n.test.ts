import { describe, expect, it } from 'vitest';
import { en, ru, nl, ka, LOCALES, type Locale, type Dict } from './index';
import { localeFromAcceptLanguage, interpolate, translator } from './index';

/**
 * TypeScript already guarantees that every locale has every key — each is
 * typed as `Dict`. These tests cover what the type system cannot see:
 *
 *   · a key present but blank,
 *   · a key present but still holding the English text,
 *   · a translation that dropped a `{placeholder}`, which silently deletes a
 *     number from the interface rather than failing,
 *   · a translation written in the wrong script.
 *
 * The last two are the ones that make a localisation quietly wrong rather than
 * obviously broken, which is why they are pinned here rather than left to
 * review.
 */

const DICTS: Record<Locale, Dict> = { en, ru, nl, ka };
const KEYS = Object.keys(en) as Array<keyof Dict>;

/**
 * Keys whose value is legitimately identical in every language: the brand, the
 * em-dash placeholder, and the language names, which are always written in the
 * language they name.
 */
const UNIVERSALLY_IDENTICAL = new Set<string>([
  'brand.name',
  'brand.product',
  'brand.org',
  'nav.group.gbm',
  'common.none',
  'lang.en',
  'lang.ru',
  'lang.nl',
  'lang.ka',
]);

/**
 * Dutch shares a good deal of vocabulary with English, so an identical string
 * is often the correct translation rather than a forgotten one. Each entry is
 * a deliberate decision; anything not listed must differ from the English.
 */
const IDENTICAL_OK: Partial<Record<Locale, Set<string>>> = {
  nl: new Set([
    'nav.group.scouting',
    'nav.dashboard',
    'nav.trends',
    'nav.clubs',
    'nav.team',
    'nav.menu',
    'nav.portfolio',
    'dash.title',
    'dash.block.portfolio',
    'port.title',
    'players.filters',
    'team.title',
    'common.contract',
    'common.club',
  ]),
};

/**
 * Latin that legitimately appears inside Russian and Georgian strings: the
 * brand, and the URL scheme named in the image guidance. Everything else in
 * Latin letters is a mistake.
 */
const PROPER_NOUNS = /GBM|Sports|Group|Intelligence|https/g;

/** Scripts a locale's own words must be written in. */
const SCRIPT: Partial<Record<Locale, { name: string; pattern: RegExp }>> = {
  ru: { name: 'Cyrillic', pattern: /[Ѐ-ӿ]/ },
  ka: { name: 'Georgian', pattern: /[Ⴀ-ჿ]/ },
};

function placeholders(value: string): string[] {
  return (value.match(/\{(\w+)\}/g) ?? []).sort();
}

describe('translations', () => {
  it('every locale is registered', () => {
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const dict = DICTS[locale];

      it('has exactly the English key set — no missing keys, no strays', () => {
        expect(Object.keys(dict).sort()).toEqual([...KEYS].sort());
      });

      it('has no blank translation', () => {
        const blank = KEYS.filter((k) => dict[k].trim().length === 0);
        expect(blank, `blank strings would render as nothing: ${blank.join(', ')}`).toEqual([]);
      });

      it('keeps every {placeholder} the English string declares', () => {
        const broken = KEYS.filter(
          (k) => placeholders(en[k]).join() !== placeholders(dict[k]).join(),
        ).map((k) => `${k}: en${placeholders(en[k])} vs ${locale}${placeholders(dict[k])}`);
        expect(
          broken,
          `a dropped placeholder deletes a value from the interface without erroring:\n${broken.join('\n')}`,
        ).toEqual([]);
      });

      if (locale !== 'en') {
        it('is actually translated, not a copy of the English', () => {
          const allowed = IDENTICAL_OK[locale] ?? new Set<string>();
          const untranslated = KEYS.filter(
            (k) =>
              dict[k] === en[k] && !UNIVERSALLY_IDENTICAL.has(k as string) && !allowed.has(k as string),
          );
          expect(
            untranslated,
            `still holding the English text: ${untranslated.join(', ')}`,
          ).toEqual([]);
        });

        const script = SCRIPT[locale];
        if (script) {
          it(`writes its own words in ${script.name}`, () => {
            const wrongScript = KEYS.filter(
              (k) => !UNIVERSALLY_IDENTICAL.has(k as string) && !script.pattern.test(dict[k]),
            );
            expect(
              wrongScript,
              `no ${script.name} characters — untranslated or transliterated: ${wrongScript.join(', ')}`,
            ).toEqual([]);
          });

          /*
           * Requiring one character of the right script is not enough: a
           * mostly-Georgian sentence with a Latin word left in the middle
           * passes that check and still reads as broken. This one caught a
           * real slip — "შენახულია, garda: {problems}", where the Georgian
           * word for "except" had been typed in transliteration.
           */
          it('leaves no stray Latin word inside its own prose', () => {
            const strays = KEYS.filter((k) => {
              if (UNIVERSALLY_IDENTICAL.has(k as string)) return false;
              // Placeholders are Latin by construction — `{count}` is a name
              // in the code, not a word on screen — so they come out first.
              const prose = dict[k].replace(/\{\w+\}/g, '').replace(PROPER_NOUNS, '');
              return /[A-Za-z]{3,}/.test(prose);
            }).map((k) => `${k}: "${dict[k]}"`);
            expect(
              strays,
              `Latin words inside ${script.name} text — transliteration or a missed phrase:\n${strays.join('\n')}`,
            ).toEqual([]);
          });
        }
      }
    });
  }
});

describe('interpolate', () => {
  it('substitutes named variables', () => {
    expect(interpolate('Contract ends in {months} mo', { months: 4 })).toBe('Contract ends in 4 mo');
  });

  it('substitutes the same variable more than once', () => {
    expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x');
  });

  it('leaves an unmatched placeholder visible rather than blanking it', () => {
    // A visible {count} is a bug report; a silent gap is a mystery.
    expect(interpolate('{known} of {total}', { known: 2 })).toBe('2 of {total}');
  });

  it('returns the template untouched when no variables are supplied', () => {
    expect(interpolate('no placeholders here')).toBe('no placeholders here');
  });
});

describe('translator', () => {
  it('translates through the chosen locale', () => {
    expect(translator('nl')('nav.players')).toBe('Spelers');
    expect(translator('ru')('nav.players')).toBe('Игроки');
    expect(translator('ka')('nav.players')).toBe('მოთამაშეები');
  });

  it('interpolates through t()', () => {
    expect(translator('nl')('common.monthsLeft', { count: 6 })).toBe('nog 6 mnd');
  });
});

describe('localeFromAcceptLanguage', () => {
  it('defaults to English when the header is absent or empty', () => {
    expect(localeFromAcceptLanguage(null)).toBe('en');
    expect(localeFromAcceptLanguage('')).toBe('en');
  });

  it('matches a regional subtag to its base language', () => {
    // GBM's staff and players are in Belgium and Georgia, so these two are the
    // common cases — an exact-match lookup would send both to English.
    expect(localeFromAcceptLanguage('nl-BE,nl;q=0.9')).toBe('nl');
    expect(localeFromAcceptLanguage('ka-GE')).toBe('ka');
    expect(localeFromAcceptLanguage('ru-RU,ru;q=0.9')).toBe('ru');
  });

  it('honours q-values rather than header order', () => {
    expect(localeFromAcceptLanguage('de;q=0.3,ru;q=0.9')).toBe('ru');
    expect(localeFromAcceptLanguage('fr,nl;q=0.8')).toBe('nl');
  });

  it('ignores a language offered with q=0', () => {
    expect(localeFromAcceptLanguage('ru;q=0,en;q=0.5')).toBe('en');
  });

  it('falls back to English when nothing is supported', () => {
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.7')).toBe('en');
  });

  it('tolerates a malformed header instead of throwing', () => {
    expect(localeFromAcceptLanguage(',,;q=,nl')).toBe('nl');
  });
});
