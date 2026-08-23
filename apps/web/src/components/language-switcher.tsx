import { setLanguage } from '@/app/settings/language-actions';
import { LOCALES, type Locale, type Translate } from '@/lib/i18n';

/**
 * Language switcher.
 *
 * Each language is its own submit button rather than a `<select>` plus Save,
 * so choosing a language is one action and the label of each option is
 * written in that language — a Georgian speaker looking for their language
 * should not have to read "Georgian" in English to find it. That is also why
 * the list is never translated: `lang.ka` is always ქართული.
 *
 * It is a plain form posting to a server action, so it works before hydration
 * and without JavaScript.
 */
export function LanguageSwitcher({ current, t }: { current: Locale; t: Translate }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <p className="eyebrow">{t('settings.language')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {LOCALES.map((locale) => {
          const active = locale === current;
          return (
            <form key={locale} action={setLanguage}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                aria-current={active ? 'true' : undefined}
                lang={locale}
                className="px-3 py-1.5 rounded-[4px] text-sm font-semibold transition-colors"
                style={{
                  background: active
                    ? 'color-mix(in srgb, var(--color-verified) 12%, transparent)'
                    : 'var(--bg)',
                  border: `1px solid ${active ? 'var(--color-verified)' : 'var(--border)'}`,
                  color: active ? 'var(--color-verified-2)' : 'var(--fg)',
                }}
              >
                {t(`lang.${locale}` as const)}
              </button>
            </form>
          );
        })}
      </div>
      <p className="text-[0.6875rem] mt-2" style={{ color: 'var(--muted)' }}>
        {t('settings.languageNote')}
      </p>
    </div>
  );
}
