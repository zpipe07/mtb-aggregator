import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function DealDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="relative pt-3">
        <Skeleton
          className={cn(
            "absolute right-4 top-0 z-10 h-6 w-36 max-w-[14rem]",
            "rounded-t-sm rounded-b-none border border-b-0 border-foreground bg-primary/35",
          )}
        />
        <div className="relative overflow-hidden rounded-sm border border-foreground bg-card shadow-sm">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 top-1.5 z-10 size-3 border-l border-t border-foreground/70"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 size-3 border-b border-r border-foreground/70"
          />
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
              <Skeleton className="mx-auto h-40 w-40 shrink-0 rounded-sm border border-foreground sm:mx-0 sm:h-44 sm:w-44" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-4 w-[94%] max-w-lg" />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Skeleton className="h-8 w-16 rounded-sm" />
                  <Skeleton className="h-7 w-28 rounded-sm border border-foreground/40" />
                </div>
                <div className="border-t border-border pt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="space-y-1">
                      <Skeleton className="h-2 w-8" />
                      <Skeleton className="h-3.5 w-16" />
                    </div>
                    <div className="space-y-1 text-right">
                      <Skeleton className="ml-auto h-2 w-20" />
                      <Skeleton className="ml-auto h-9 w-28" />
                    </div>
                  </div>
                </div>
                <Skeleton className="mt-5 h-11 w-40 rounded-sm" />
              </div>
            </div>

            <div className="mt-8 space-y-4 border-t border-foreground/15 pt-8">
              <div className="flex flex-wrap items-end gap-3">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-5 w-40" />
                <span className="mb-0.5 h-px min-w-8 flex-1 max-w-xs bg-border" />
              </div>
              <div className="flex flex-wrap gap-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-56 w-full rounded-sm border border-foreground/40 bg-muted/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
