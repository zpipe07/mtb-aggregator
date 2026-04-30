import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CategoryTileSkeletonProps = {
  className?: string;
};

/** Placeholder for {@link CategoryCard} with photo + bottom ink strip. */
export function CategoryTileSkeleton({ className }: CategoryTileSkeletonProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-sm border border-foreground bg-card shadow-sm",
        className,
      )}
    >
      <div className="relative aspect-[4/3]">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-foreground px-3 py-2.5">
          <Skeleton className="h-2 w-16 bg-primary/40" />
          <Skeleton className="h-3.5 w-[80%] max-w-[12rem] bg-background/35" />
        </div>
      </div>
    </div>
  );
}
