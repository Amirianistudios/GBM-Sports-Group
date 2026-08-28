import { AppShell } from '@/components/app-shell';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('nav.group.organization')} title={t('settings.title')}>
      <section className="px-4 md:px-6 pt-4">
        <div className="card p-4">
          <div className="skeleton h-4 w-48" />
          <div className="skeleton h-3.5 w-64 mt-3" />
        </div>
      </section>
    </AppShell>
  );
}
