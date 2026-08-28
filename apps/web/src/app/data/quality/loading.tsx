import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Organization" title="Data quality">
      <div className="pt-4" />
      <SkeletonList rows={8} />
    </AppShell>
  );
}
