import { Skeleton } from "@/components/ui/skeleton";

export function DealsCategoryNavSkeleton() {
  return (
    <div
      className="mb-4 space-y-4 border-b border-foreground/15 pb-4"
      aria-hidden
    >
      <div className="flex flex-wrap items-end gap-3">
        <Skeleton className="h-2.5 w-24" />
        <span className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-sm" />
        <Skeleton className="h-9 w-32 rounded-sm" />
      </div>
      <div className="space-y-3 border-t border-foreground/15 pt-4">
        <Skeleton className="h-2.5 w-40" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
