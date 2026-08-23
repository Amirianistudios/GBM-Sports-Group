import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection, SkeletonStatStrip } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('brand.org')} title={t('dash.title')}>
      <SkeletonStatStrip />
      <SkeletonFeedSection title="Rising players" />
      <SkeletonFeedSection title="Emerging U21" />
      <SkeletonFeedSection title="Contract opportunities" />
    </AppShell>
  );
}
