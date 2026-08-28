import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection, SkeletonStatStrip } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('nav.group.gbm')} title={t('port.title')}>
      <SkeletonStatStrip />
      <SkeletonFeedSection title={t('port.group.represented')} />
    </AppShell>
  );
}
