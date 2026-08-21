import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection, SkeletonStatStrip } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Loading" title="Intelligence feed">
      <SkeletonStatStrip />
      <SkeletonFeedSection title="Rising players" />
      <SkeletonFeedSection title="Emerging U21" />
      <SkeletonFeedSection title="Contract opportunities" />
    </AppShell>
  );
}
