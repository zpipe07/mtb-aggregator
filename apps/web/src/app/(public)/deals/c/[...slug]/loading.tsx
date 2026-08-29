import {
  DealCardSkeleton,
  DealsCategoryNavSkeleton,
  DealsToolbarSkeleton,
  FilterSidebarSkeleton,
} from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryDealsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex gap-8">
        <aside className="hidden w-60 flex-shrink-0 lg:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-2rem)] min-h-[500px] flex-col rounded-[var(--radius)] border border-border bg-card p-4">
            <Skeleton className="mb-4 h-2.5 w-20" />
            <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
              <FilterSidebarSkeleton />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <DealsToolbarSkeleton />
          <DealsCategoryNavSkeleton variant="breadcrumb" />

          <div className="mb-4 pb-4">
            <Skeleton className="mx-auto h-10 max-w-md rounded-sm" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <DealCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
