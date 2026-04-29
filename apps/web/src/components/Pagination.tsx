import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type PaginationProps = {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
};

/** Build a list of page numbers to show, with null for ellipsis */
function pageNumbers(
  currentPage: number,
  totalPages: number,
): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | null)[] = [];
  const add = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p);
  };
  add(1);
  if (currentPage > 3) pages.push(null);
  for (
    let p = Math.max(1, currentPage - 1);
    p <= Math.min(totalPages, currentPage + 1);
    p++
  ) {
    add(p);
  }
  if (currentPage < totalPages - 1) pages.push(null);
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
      className="flex flex-col gap-3 border-t-2 border-border/50 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
      aria-label="Deals pagination"
    >
      <p className="shrink-0 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase sm:text-[11px]">
        Page {currentPage} / {totalPages} · {totalCount} deals
      </p>
      <div className="flex w-full min-w-0 items-stretch gap-1 sm:w-auto sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={!hasPrev}
          className="max-sm:px-2.5 shrink-0 font-mono text-[10px] font-semibold tracking-[0.12em] sm:min-w-[4.5rem]"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4 sm:hidden" aria-hidden />
          <span className="max-sm:sr-only">‹ PREV</span>
        </Button>
        <div
          className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto overscroll-x-contain px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Page numbers"
        >
          {pages.map((p, i) =>
            p === null ? (
              <span
                key={`ellipsis-${i}`}
                className="shrink-0 px-1 font-mono text-muted-foreground sm:px-2"
                aria-hidden
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(p)}
                aria-label={
                  p === currentPage ? `Page ${p} (current)` : `Page ${p}`
                }
                aria-current={p === currentPage ? "page" : undefined}
                className={cn(
                  "min-w-8 shrink-0 px-2 font-mono text-[11px] font-bold tabular-nums sm:min-w-[2.25rem] sm:px-3",
                  p === currentPage &&
                    "border-foreground bg-foreground text-primary hover:bg-foreground/90 hover:text-primary",
                )}
              >
                {p}
              </Button>
            ),
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(offset + limit)}
          disabled={!hasNext}
          className="max-sm:px-2.5 shrink-0 font-mono text-[10px] font-semibold tracking-[0.12em] sm:min-w-[4.5rem]"
          aria-label="Next page"
        >
          <span className="max-sm:sr-only">NEXT ›</span>
          <ChevronRight className="size-4 sm:hidden" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
