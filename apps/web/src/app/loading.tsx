import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection, SkeletonStatStrip } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('brand.org')} title={t('dash.title')}>
      <SkeletonStatStrip />
      {/* The skeleton names the blocks the real page renders — a placeholder
          announcing sections that never arrive reads as a broken page. */}
      <SkeletonFeedSection title={t('dash.block.priority')} />
      <SkeletonFeedSection title={t('dash.block.opportunities')} />
      <SkeletonFeedSection title={t('dash.block.portfolio')} />
    </AppShell>
  );
}
