import Link from 'next/link';

/**
 * URL-driven pagination without exact totals: the query fetches pageSize + 1
 * rows, so "next page exists" is known without paying a full-view COUNT —
 * which on a computed view costs as much as the page itself.
 */
export function Pagination({
  page,
  hasNext,
  makeHref,
}: {
  page: number;
  hasNext: boolean;
  makeHref: (page: number) => string;
}) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav className="flex items-center justify-between px-4 md:px-6 py-3" aria-label="Pagination">
      {page > 1 ? (
        <Link
          href={makeHref(page - 1)}
          className="badge badge-neutral !px-3 !py-1.5 !text-xs"
          rel="prev"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="eyebrow">Page {page}</span>
      {hasNext ? (
        <Link
          href={makeHref(page + 1)}
          className="badge badge-neutral !px-3 !py-1.5 !text-xs"
          rel="next"
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
