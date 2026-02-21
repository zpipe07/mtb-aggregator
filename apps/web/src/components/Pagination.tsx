type PaginationProps = {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
};

/** Build a list of page numbers to show, with null for ellipsis */
function pageNumbers(currentPage: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | null)[] = [];
  const add = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p);
  };
  add(1);
  if (currentPage > 3) pages.push(null);
  for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
    add(p);
  }
  if (currentPage < totalPages - 2) pages.push(null);
  if (totalPages > 1 && !pages.includes(totalPages)) add(totalPages);
  return pages;
}

export function Pagination({
  totalCount,
  limit,
  offset,
  onPageChange,
}: PaginationProps) {
  if (totalCount <= 0 || limit <= 0) return null;

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalCount / limit);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;
  const pages = pageNumbers(currentPage, totalPages);

  const goToPage = (page: number) => onPageChange((page - 1) * limit);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-4 py-4 border-stone-200"
      aria-label="Deals pagination"
    >
      <div className="text-sm text-stone-600">
        Page {currentPage} of {totalPages} ({totalCount} deals)
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={!hasPrev}
          className="min-w-[4.5rem] px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-50"
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="sr-only">Page numbers:</span>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} className="px-2 text-stone-400" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => goToPage(p)}
              aria-label={p === currentPage ? `Page ${p} (current)` : `Page ${p}`}
              aria-current={p === currentPage ? "page" : undefined}
              className={`min-w-[2.25rem] h-9 px-2 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-1 ${
                p === currentPage
                  ? "border-stone-700 bg-stone-800 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(offset + limit)}
          disabled={!hasNext}
          className="min-w-[4.5rem] px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-50"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
