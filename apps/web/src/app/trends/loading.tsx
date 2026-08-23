import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('nav.group.intelligence')} title={t('nav.trends')}>
      <SkeletonFeedSection title="Median market value by age" />
      <SkeletonFeedSection title="Median market value by position" />
    </AppShell>
  );
}
