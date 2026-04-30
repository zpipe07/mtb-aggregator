import { Skeleton } from "@/components/ui/skeleton";

/** Content-only; page shell supplies `// Filters` heading like {@link DealsPageContent}. */
export function FilterSidebarSkeleton() {
  return (
    <div className="space-y-6 pr-1">
      {["store", "brand", "discount"].map((k) => (
        <div key={k} className="space-y-1">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-10 w-full rounded-sm" />
        </div>
      ))}
      <div className="space-y-4 border-t border-foreground/15 pt-4">
        <Skeleton className="h-2.5 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-[88%] rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
        </div>
      </div>
    </div>
  );
}
