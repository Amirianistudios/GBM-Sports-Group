import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { LanguageSwitcher } from '@/components/language-switcher';
import { formatDate } from '@/lib/format';
import { getTranslator } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * SETTINGS — account, language and session, honestly scoped.
 * Role management and team administration arrive with a later phase; until
 * then this page shows the signed-in identity, the interface language and the
 * sign-out action rather than pretending controls exist.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const { locale, t } = await getTranslator();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name, email, created_at').eq('id', user.id).maybeSingle()
    : { data: null };

  return (
    <AppShell eyebrow={t('nav.group.organization')} title={t('settings.title')}>
      <section className="px-4 md:px-6 pt-4 max-w-xl">
        <div className="card overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="eyebrow">{t('settings.signedInAs')}</p>
            <p className="font-semibold text-[0.9375rem] mt-1">
              {profile?.full_name ?? user?.email ?? t('common.none')}
            </p>
            <p className="data text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email}</p>
          </div>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="eyebrow">{t('settings.memberSince')}</p>
            <p className="data text-sm mt-1">{formatDate(profile?.created_at ?? user?.created_at)}</p>
          </div>

          <LanguageSwitcher current={locale} t={t} />

          <form action="/auth/signout" method="post" className="px-4 py-3">
            <button
              type="submit"
              className="px-3 py-2 rounded-[4px] text-sm font-semibold"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--color-conflict)' }}
            >
              {t('nav.signout')}
            </button>
          </form>
        </div>

        <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
          {t('settings.note')}
        </p>
      </section>
      <div className="h-8" />
    </AppShell>
  );
}
