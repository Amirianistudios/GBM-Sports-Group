import { AppShell } from '@/components/app-shell';
import { SkeletonList, SkeletonStatStrip } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="System" title="Data & providers">
      <SkeletonStatStrip />
      <SkeletonList rows={6} />
    </AppShell>
  );
}
