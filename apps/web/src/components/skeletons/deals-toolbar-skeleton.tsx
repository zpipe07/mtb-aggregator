import { Skeleton } from "@/components/ui/skeleton";

export function DealsToolbarSkeleton() {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <Skeleton className="h-[52px] min-h-0 flex-1 rounded-sm border-t border-b border-foreground" />
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-10 w-[7.5rem] rounded-sm lg:hidden" />
        <div className="space-y-1">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-10 w-40 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
