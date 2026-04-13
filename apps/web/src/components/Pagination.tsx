import { Button } from "./ui/button";

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
      className="flex flex-wrap items-center justify-between gap-4 py-4 border-t-2 border-border/50"
      aria-label="Deals pagination"
    >
      <div className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages} ({totalCount} deals)
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={!hasPrev}
          className="min-w-[4.5rem]"
          aria-label="Previous page"
        >
          Previous
        </Button>
        <span className="sr-only">Page numbers:</span>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              variant={p === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => goToPage(p)}
              aria-label={p === currentPage ? `Page ${p} (current)` : `Page ${p}`}
              aria-current={p === currentPage ? "page" : undefined}
              className="min-w-[2.25rem]"
            >
              {p}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(offset + limit)}
          disabled={!hasNext}
          className="min-w-[4.5rem]"
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
