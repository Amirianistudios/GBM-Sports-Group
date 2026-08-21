import { AppShell } from '@/components/app-shell';
import { SkeletonList, SkeletonStatStrip } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Scouting" title="Players">
      <SkeletonStatStrip />
      <SkeletonList rows={10} />
    </AppShell>
  );
}
