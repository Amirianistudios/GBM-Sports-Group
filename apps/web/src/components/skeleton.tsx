/**
 * Layout-matched loading primitives for route-level loading.tsx files.
 * Each mirrors the surface it stands in for — never a generic grey block.
 */

export function SkeletonRow() {
  return (
    <div className="sheet-row">
      <div className="flex items-center gap-3">
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 5 }} />
        <div className="flex-1 min-w-0">
          <div className="skeleton h-3.5 w-40 max-w-[60%]" />
          <div className="skeleton h-3 w-56 max-w-[80%] mt-2" />
        </div>
        <div className="skeleton h-4 w-14" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-3">
      <div className="flex items-start gap-3">
        <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 5 }} />
        <div className="flex-1 min-w-0">
          <div className="skeleton h-3.5 w-28" />
          <div className="skeleton h-3 w-20 mt-2" />
          <div className="skeleton h-3 w-24 mt-2" />
        </div>
      </div>
      <div className="mt-3 pt-2.5 flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="skeleton h-4 w-14" />
        <div className="skeleton h-4 w-10" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="surface mx-4 md:mx-6 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonStatStrip() {
  return (
    <div className="px-4 md:px-6 py-3 flex gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton h-5 w-24" />
      ))}
    </div>
  );
}

export function SkeletonFeedSection({ title }: { title?: string }) {
  return (
    <section className="px-4 md:px-6 mt-6">
      {title ? (
        <p className="eyebrow mb-2">{title}</p>
      ) : (
        <div className="skeleton h-3 w-32 mb-3" />
      )}
      <div className="surface overflow-hidden">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </section>
  );
}
