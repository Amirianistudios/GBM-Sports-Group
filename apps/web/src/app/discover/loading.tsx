import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('nav.group.intelligence')} title={t('nav.discover')}>
      <div className="pt-4" />
      <SkeletonList rows={8} />
    </AppShell>
  );
}
