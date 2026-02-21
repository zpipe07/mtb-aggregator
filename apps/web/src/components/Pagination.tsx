type PaginationProps = {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
};

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

  return (
    <nav
      className="flex items-center justify-between gap-4 py-4 border-t border-stone-200 mt-8"
      aria-label="Deals pagination"
    >
      <div className="text-sm text-stone-600">
        Page {currentPage} of {totalPages} ({totalCount} deals)
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={!hasPrev}
          className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-50"
          aria-label="Previous page"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(offset + limit)}
          disabled={!hasNext}
          className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-50"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
