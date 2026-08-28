import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Organization" title="Team">
      <div className="pt-4" />
      <SkeletonList rows={3} />
    </AppShell>
  );
}
