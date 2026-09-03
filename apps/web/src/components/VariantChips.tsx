import type { Deal } from "@/api";
import { formatMoney } from "@/lib/formatMoney";
import {
  compactChipGroup,
  limitChips,
  summarizeDealSizeChips,
  type VariantChip,
  type VariantChipGroup,
} from "@/lib/inStockVariantChips";
import { cn } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

type VariantChipsProps = {
  deal: Deal;
  /** Compact = one row for listing cards. Detail = labeled groups on the PDP. */
  density?: "compact" | "detail";
  className?: string;
};

function chipPrice(chip: VariantChip): string | null {
  if (chip.minPrice === chip.maxPrice) {
    return `$${formatMoney(chip.minPrice)}`;
  }
  return `$${formatMoney(chip.minPrice)}–$${formatMoney(chip.maxPrice)}`;
}

function ChipList({
  group,
  showPrices,
  compact,
}: {
  group: VariantChipGroup;
  showPrices: boolean;
  compact: boolean;
}) {
  const { visible, overflow } = compact
    ? limitChips(group.chips)
    : { visible: group.chips, overflow: 0 };
  const label =
    group.kind === "size"
      ? "In-stock sizes"
      : group.kind === "color"
        ? "In-stock colors"
        : `In-stock ${group.key}`;

  return (
    <ul
      className={cn(
        "flex min-w-0 gap-1",
        compact ? "flex-nowrap" : "flex-wrap",
      )}
      aria-label={label}
    >
      {visible.map((chip) => {
        const price = showPrices ? chipPrice(chip) : null;
        return (
          <li key={chip.label}>
            <span
              className={cn(
                "inline-flex max-w-[11rem] items-baseline gap-1 truncate rounded-sm border border-foreground/40 bg-card px-2 py-0.5",
                monoMicro,
              )}
              title={price ? `${chip.label} ${price}` : chip.label}
            >
              <span className="truncate font-medium text-foreground">
                {chip.label}
              </span>
              {price ? (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {price}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
      {overflow > 0 ? (
        <li>
          <span
            className={cn(
              "inline-flex rounded-sm border border-dashed border-foreground/40 bg-card px-2 py-0.5 text-muted-foreground",
              monoMicro,
            )}
          >
            +{overflow}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

export function VariantChips({
  deal,
  density = "compact",
  className,
}: VariantChipsProps) {
  const summary = summarizeDealSizeChips(deal);
  if (!summary) return null;

  if (density === "compact") {
    const group = compactChipGroup(summary);
    if (!group) return null;
    const kicker =
      group.kind === "size"
        ? "in stock"
        : group.kind === "color"
          ? "colors"
          : group.key.toLowerCase();
    return (
      <div className={cn("flex min-w-0 items-center gap-2", className)}>
        <span className={cn(monoMicro, "shrink-0 text-muted-foreground")}>
          {kicker}
        </span>
        <div className="min-w-0 overflow-hidden">
          <ChipList group={group} showPrices={false} compact />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {summary.groups.map((group) => (
        <div key={`${group.kind}-${group.key}`} className="space-y-1.5">
          <p className={cn(monoMicro, "text-muted-foreground")}>
            {group.kind === "size"
              ? "in-stock sizes"
              : group.kind === "color"
                ? "in-stock colors"
                : `in-stock ${group.key.toLowerCase()}`}
          </p>
          <ChipList
            group={group}
            showPrices={group.hasPriceSpread}
            compact={false}
          />
        </div>
      ))}
    </div>
  );
}
