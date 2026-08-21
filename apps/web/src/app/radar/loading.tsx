import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Intelligence" title="Market Radar">
      <SkeletonFeedSection title="Rapid value growth" />
      <SkeletonFeedSection title="U21 risers" />
      <SkeletonFeedSection title="Contract window closing" />
    </AppShell>
  );
}
