import { AppShell } from '@/components/app-shell';
import { SkeletonList } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="GBM" title="Recruitment intelligence">
      <section className="px-4 md:px-6 pt-4">
        <div className="card p-4">
          <div className="skeleton h-5 w-64 max-w-[80%]" />
          <div className="skeleton h-3.5 w-96 max-w-full mt-3" />
          <div className="skeleton h-3.5 w-80 max-w-[90%] mt-2" />
        </div>
      </section>
      <div className="pt-2" />
      <SkeletonList rows={6} />
    </AppShell>
  );
}
