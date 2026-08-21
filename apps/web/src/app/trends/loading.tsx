import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Intelligence" title="Trends">
      <SkeletonFeedSection title="Median market value by age" />
      <SkeletonFeedSection title="Median market value by position" />
    </AppShell>
  );
}
