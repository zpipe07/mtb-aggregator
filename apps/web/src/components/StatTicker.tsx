import { cn } from "@/lib/utils";

export type StatTickerProps = {
  storeCount: number;
  dealCount: number;
  lastUpdated: string;
};

function StatItem({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span
        className={cn(
          "font-mono tabular-nums text-foreground",
          compact ? "text-sm font-medium" : "text-lg font-semibold sm:text-xl",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function StatTicker({
  storeCount,
  dealCount,
  lastUpdated,
}: StatTickerProps) {
  const stats = [
    {
      key: "shops",
      value: storeCount.toLocaleString(),
      label: "shops",
      compact: false,
    },
    {
      key: "deals",
      value: dealCount.toLocaleString(),
      label: "deals",
      compact: false,
    },
    {
      key: "updated",
      value: lastUpdated,
      label: "updated",
      compact: true,
    },
  ] as const;

  return (
    <div
      role="status"
      aria-label="Live deal statistics"
      className="mx-auto mt-5 mb-1 flex w-full max-w-xl flex-col items-center gap-4 sm:max-w-none sm:flex-row sm:justify-center sm:gap-6"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-primary animate-pulse"
        />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
          {"// LIVE"}
        </span>
      </div>

      <div className="grid w-full grid-cols-3 gap-3 sm:flex sm:w-auto sm:items-center sm:gap-6">
        {stats.map((stat, index) => (
          <div
            key={stat.key}
            className={cn(
              "flex justify-center",
              index > 0 && "sm:border-l sm:border-border sm:pl-6",
            )}
          >
            <StatItem
              value={stat.value}
              label={stat.label}
              compact={stat.compact}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
