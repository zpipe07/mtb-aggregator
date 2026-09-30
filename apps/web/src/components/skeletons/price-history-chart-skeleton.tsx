import { PRICE_HISTORY_CHART_FRAME_CLASS } from "@/components/priceHistoryChartFrame";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PriceHistoryChartSkeletonProps = {
  className?: string;
};

/** Placeholder for {@link PriceHistoryChart} while its recharts chunk loads. */
export function PriceHistoryChartSkeleton({
  className,
}: PriceHistoryChartSkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(PRICE_HISTORY_CHART_FRAME_CLASS, className)}
    >
      <Skeleton className="h-full w-full" />
    </div>
  );
}
