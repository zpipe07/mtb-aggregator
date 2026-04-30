import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DealCardSkeletonProps = {
  className?: string;
};

/** Mirrors {@link DealCard} — SKU tab, square media, body, price row, footer. */
export function DealCardSkeleton({ className }: DealCardSkeletonProps) {
  return (
    <div className={cn("relative pt-3 rounded-sm", className)}>
      <Skeleton
        className={cn(
          "absolute right-4 top-0 z-10 h-6 w-24 max-w-[8.5rem] rounded-t-sm rounded-b-none",
          "border border-b-0 border-foreground bg-primary/35",
        )}
      />
      <div className="relative overflow-hidden rounded-sm border border-foreground bg-card">
        <Skeleton
          className={cn(
            "aspect-square w-full rounded-none border-b border-foreground",
          )}
        />
        <div className="space-y-3 p-4 pb-0">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
            <div className="space-y-1">
              <Skeleton className="h-2 w-9" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-right">
              <Skeleton className="ml-auto h-2 w-[4.5rem]" />
              <Skeleton className="ml-auto h-7 w-24 sm:w-28" />
            </div>
          </div>
        </div>
        <div className="space-y-3 px-4 pb-4 pt-3">
          <Skeleton className="h-2.5 w-28 max-w-[85%]" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-9 w-full flex-1 rounded-sm" />
            <Skeleton className="h-9 w-full flex-1 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
