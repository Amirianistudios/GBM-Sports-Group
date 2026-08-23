import { AppShell } from '@/components/app-shell';
import { SkeletonList, SkeletonStatStrip } from '@/components/skeleton';
import { getTranslator } from '@/lib/i18n';

export default async function Loading() {
  const { t } = await getTranslator();
  return (
    <AppShell eyebrow={t('nav.group.scouting')} title={t('players.title')}>
      <SkeletonStatStrip />
      <SkeletonList rows={10} />
    </AppShell>
  );
}
