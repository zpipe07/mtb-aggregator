import { Skeleton } from "@/components/ui/skeleton";

export function DealsCategoryNavSkeleton() {
  return (
    <div
      className="mb-4 border-b border-foreground/15 pb-4"
      aria-hidden
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Skeleton className="h-2.5 w-24" />
        <span className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-sm" />
        <Skeleton className="h-9 w-32 rounded-sm" />
        <Skeleton className="h-9 w-24 rounded-sm" />
      </div>
    </div>
  );
}
