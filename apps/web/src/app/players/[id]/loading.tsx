import { AppShell } from '@/components/app-shell';
import { SkeletonFeedSection } from '@/components/skeleton';

export default function Loading() {
  return (
    <AppShell eyebrow="Player" title="Loading…">
      <section className="px-4 md:px-6 pt-3">
        <div className="card p-4 md:p-5">
          <div className="flex items-start gap-4">
            <div className="skeleton" style={{ width: 96, height: 96, borderRadius: 5 }} />
            <div className="flex-1">
              <div className="skeleton h-6 w-56 max-w-[70%]" />
              <div className="skeleton h-4 w-40 mt-3" />
              <div className="skeleton h-5 w-32 mt-3" />
            </div>
          </div>
        </div>
      </section>
      <SkeletonFeedSection />
      <SkeletonFeedSection />
    </AppShell>
  );
}
