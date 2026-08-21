import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell>
      <div className="pt-4" />
      <SkeletonList rows={8} />
    </AppShell>
  );
}
