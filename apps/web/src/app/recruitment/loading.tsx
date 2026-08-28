import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="GBM" title="Recruitment intelligence">
      <div className="pt-4" />
      <SkeletonList rows={6} />
    </AppShell>
  );
}
