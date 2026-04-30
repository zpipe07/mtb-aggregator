import { CategoryTileSkeleton, DealCardSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <section className="mb-12 text-center lg:mb-16">
        <Skeleton className="mx-auto mb-3 h-2.5 w-48 max-w-md" />
        <div className="mx-auto inline-block text-left">
          <Skeleton className="mb-2 h-10 w-[min(100%,18rem)] sm:h-12 md:h-14" />
          <Skeleton className="h-10 w-[min(100%,20rem)] sm:h-12 md:h-14" />
        </div>
        <Skeleton className="mx-auto mt-4 h-5 max-w-md" />
        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-stretch">
          <Skeleton className="h-[52px] min-h-0 flex-1 rounded-sm border-t border-b border-foreground" />
          <Skeleton className="h-[52px] w-full rounded-sm sm:min-w-[8rem]" />
          <Skeleton className="h-[52px] w-full rounded-sm sm:min-w-[8rem]" />
        </div>
      </section>

      <section className="mb-12 lg:mb-16">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <Skeleton className="h-2.5 w-10 pb-0.5" />
          <Skeleton className="h-7 w-52 max-w-[14rem]" />
          <span className="mb-0.5 hidden h-px min-w-8 flex-1 bg-border sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CategoryTileSkeleton key={i} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Skeleton className="h-2.5 w-10 pb-0.5" />
            <Skeleton className="h-7 w-52 max-w-[16rem]" />
            <span className="mb-0.5 hidden h-px min-w-8 max-w-xs flex-1 bg-border sm:block" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <DealCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
