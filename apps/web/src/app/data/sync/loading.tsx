import { AppShell } from '@/components/app-shell';
import { SkeletonList, SkeletonStatStrip } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Organization" title="Sync status">
      <SkeletonStatStrip />
      <SkeletonList rows={8} />
    </AppShell>
  );
}
