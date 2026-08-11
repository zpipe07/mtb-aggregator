import { cn } from "@/lib/utils";

export type StatTickerVariant = "default" | "inverted";

export type StatTickerProps = {
  storeCount: number;
  dealCount: number;
  lastUpdated: string;
  /** Dark bar with light text — useful for hero contrast. */
  variant?: StatTickerVariant;
  /** Edge-to-edge bar; pairs with `variant="inverted"`. Content stays max-w-6xl. */
  fullBleed?: boolean;
  className?: string;
};

function StatItem({
  value,
  label,
  compact = false,
  inverted = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
  inverted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span
        className={cn(
          "font-mono tabular-nums",
          inverted ? "text-background" : "text-foreground",
          compact ? "text-sm font-medium" : "text-lg font-semibold sm:text-xl",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
          inverted ? "text-background/65" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function StatTicker({
  storeCount,
  dealCount,
  lastUpdated,
  variant = "default",
  fullBleed = false,
  className,
}: StatTickerProps) {
  const inverted = variant === "inverted";
  const useFullBleedBar = fullBleed && inverted;

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

  const content = (
    <>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-destructive"
        />
        <span
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
            inverted ? "text-background" : "text-foreground",
          )}
        >
          {"// LIVE"}
        </span>
      </div>

      <div className="grid w-full grid-cols-3 gap-3 sm:flex sm:w-auto sm:items-center sm:gap-6">
        {stats.map((stat, index) => (
          <div
            key={stat.key}
            className={cn(
              "flex justify-center",
              index > 0 &&
                (inverted
                  ? "sm:border-l sm:border-background/20 sm:pl-6"
                  : "sm:border-l sm:border-border sm:pl-6"),
            )}
          >
            <StatItem
              value={stat.value}
              label={stat.label}
              compact={stat.compact}
              inverted={inverted}
            />
          </div>
        ))}
      </div>
    </>
  );

  if (useFullBleedBar) {
    return (
      <div
        role="status"
        aria-label="Live deal statistics"
        className={cn("w-full bg-foreground", className)}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-3.5 sm:flex-row sm:justify-center sm:gap-6 sm:px-6">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Live deal statistics"
      className={cn(
        "mx-auto flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6",
        inverted
          ? "max-w-none rounded-sm bg-foreground px-4 py-3.5 sm:px-6"
          : "mb-1 mt-5 max-w-xl sm:max-w-none",
        className,
      )}
    >
      {content}
    </div>
  );
}
