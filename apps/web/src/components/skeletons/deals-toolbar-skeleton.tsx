import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors {@link Toolbar}: `// search` inside search block, `// sort`, aligned row. */
export function DealsToolbarSkeleton() {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-[3.25rem] w-full rounded-sm border-t border-b border-foreground" />
        </div>
        <Skeleton className="h-[3.25rem] w-[7.5rem] shrink-0 rounded-sm lg:hidden" />
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-[3.25rem] w-full rounded-sm sm:w-40" />
      </div>
    </div>
  );
}
