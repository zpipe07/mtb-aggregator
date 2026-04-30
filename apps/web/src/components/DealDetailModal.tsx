import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { track } from "@vercel/analytics";
import { useDeal, usePriceHistory } from "../hooks/queries";
import { Button } from "./ui/button";
import { cn, focusRing } from "@/lib/utils";

type DealDetailModalProps = {
  dealId: number | null;
  onClose: () => void;
};

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

function formatMoney(n: number) {
  return n.toFixed(2);
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatAxisDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function DealDetailModal({ dealId, onClose }: DealDetailModalProps) {
  const { data: deal, isPending: loading, isError, error } = useDeal(dealId);
  const { data: priceHistory } = usePriceHistory(dealId);

  if (dealId == null) return null;

  const viewUrl = deal?.affiliate_url || deal?.product_url;
  const discountPct =
    deal?.discount_pct != null
      ? Math.round(deal.discount_pct)
      : deal?.original_price != null &&
          deal.original_price > 0 &&
          deal.original_price > (deal?.current_price ?? 0)
        ? Math.round(
            (1 - (deal.current_price ?? 0) / deal.original_price) * 100,
          )
        : null;

  const savings =
    deal != null &&
    deal.original_price != null &&
    deal.original_price > deal.current_price
      ? deal.original_price - deal.current_price
      : null;

  const chartData =
    priceHistory?.points.map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-modal-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border-2 border-foreground bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-foreground/40 bg-card px-4 py-3 sm:px-6">
          <h2
            id="deal-modal-title"
            className={cn(
              monoMicro,
              "truncate pr-4 text-foreground",
            )}
          >
            {"// deal details"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground",
              focusRing,
            )}
            aria-label="Close"
          >
            <span className="font-mono text-lg leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {loading && (
            <div className="py-12 text-center text-muted-foreground">
              Loading…
            </div>
          )}
          {isError && (
            <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive">
              {error?.message ?? "Failed to load"}
            </div>
          )}
          {!loading && !isError && deal && (
            <>
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                <div className="mx-auto w-36 shrink-0 overflow-hidden rounded-sm border border-foreground bg-muted sm:mx-0 sm:w-40">
                  {deal.image_url ? (
                    <img
                      src={deal.image_url}
                      alt={deal.product_name}
                      className="aspect-square h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {deal.brand && (
                    <p className={cn(monoMicro, "text-muted-foreground")}>
                      {"// "}
                      {deal.brand}
                    </p>
                  )}
                  <h3 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-foreground">
                    {deal.product_name}
                  </h3>
                  <p className={cn(monoMicro, "mt-2 text-muted-foreground")}>
                    {"// "}
                    {deal.store_name.toUpperCase()}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {discountPct != null && discountPct > 0 && (
                      <span
                        className={cn(
                          "inline-block rounded-sm bg-primary px-2 py-1 font-mono text-sm font-semibold tabular-nums text-foreground",
                          "shadow-[2px_2px_0_var(--foreground)]",
                        )}
                        style={{ transform: "rotate(-2deg)" }}
                      >
                        −{discountPct}%
                      </span>
                    )}
                    {priceHistory?.price_dropped && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm border border-foreground/40 bg-card px-2 py-0.5",
                          monoMicro,
                          "text-foreground",
                        )}
                      >
                        PRICE DROP
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4",
                      savings != null && savings > 0 ? "justify-between" : "",
                    )}
                  >
                    {savings != null && savings > 0 ? (
                      <div className="space-y-0.5">
                        <span
                          className={cn(monoMicro, "text-muted-foreground block")}
                        >
                          save
                        </span>
                        <span className="font-mono text-sm font-medium leading-none tabular-nums text-muted-foreground">
                          ${formatMoney(savings)}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "min-w-0 space-y-0.5",
                        savings != null && savings > 0
                          ? "text-right sm:ml-auto"
                          : "text-left",
                      )}
                    >
                      {deal.original_price != null &&
                        deal.original_price > deal.current_price && (
                          <span
                            className={cn(
                              monoMicro,
                              "block text-muted-foreground line-through tabular-nums",
                            )}
                          >
                            was ${formatMoney(deal.original_price)}
                          </span>
                        )}
                      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                        ${formatMoney(deal.current_price)}
                      </span>
                    </div>
                  </div>
                  <Button asChild className="mt-5">
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        track("view_at_store", {
                          deal_id: deal.id,
                          store: deal.store_name,
                          brand: deal.brand ?? "",
                        })
                      }
                    >
                      <span className="relative z-[1]">Snag the Deal</span>
                    </a>
                  </Button>
                </div>
              </div>

              {priceHistory && (
                <div className="mt-8 border-t border-border pt-6">
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <span className={cn(monoMicro, "text-muted-foreground")}>
                      {"// 01"}
                    </span>
                    <h4 className="text-base font-semibold tracking-tight text-foreground">
                      Price history
                    </h4>
                    <span className="mb-0.5 h-px min-w-6 flex-1 max-w-[12rem] bg-border" />
                  </div>
                  {chartData.length === 0 && (
                    <p className="text-sm text-muted-foreground">No history yet.</p>
                  )}
                  {chartData.length === 1 && (
                    <p className="text-sm text-muted-foreground">
                      One price recorded: ${chartData[0].price.toFixed(2)} on{" "}
                      {formatDate(chartData[0].recorded_at)}.
                    </p>
                  )}
                  {chartData.length >= 2 && (
                    <>
                      <div className="mb-3 flex flex-wrap gap-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <span>
                          LOW{" "}
                          <strong className="text-foreground tabular-nums">
                            ${priceHistory.lowest_price.toFixed(2)}
                          </strong>
                        </span>
                        <span>
                          HIGH{" "}
                          <strong className="text-foreground tabular-nums">
                            ${priceHistory.highest_price.toFixed(2)}
                          </strong>
                        </span>
                        <span>
                          AVG{" "}
                          <strong className="text-foreground tabular-nums">
                            ${priceHistory.avg_price.toFixed(2)}
                          </strong>
                        </span>
                      </div>
                      <div className="h-56 w-full rounded-sm border border-foreground/40 bg-card/50 p-2 sm:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="var(--color-border)"
                            />
                            <XAxis
                              dataKey="dateLabel"
                              tick={{
                                fontSize: 11,
                                fontFamily: "var(--font-mono)",
                              }}
                              stroke="var(--color-muted-foreground)"
                            />
                            <YAxis
                              tick={{
                                fontSize: 11,
                                fontFamily: "var(--font-mono)",
                              }}
                              stroke="var(--color-muted-foreground)"
                              tickFormatter={(v) => `$${v}`}
                              domain={["dataMin - 5", "dataMax + 5"]}
                            />
                            <Tooltip
                              formatter={(value: number) => [
                                `$${value.toFixed(2)}`,
                                "Price",
                              ]}
                              labelFormatter={(_, payload) =>
                                payload?.[0]?.payload?.recorded_at
                                  ? formatDate(payload[0].payload.recorded_at)
                                  : ""
                              }
                              contentStyle={{
                                borderRadius: "2px",
                                border: "1px solid var(--color-border)",
                                backgroundColor: "var(--color-card)",
                                color: "var(--color-foreground)",
                                fontFamily: "var(--font-mono)",
                                fontSize: "12px",
                                boxShadow: "var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.06))",
                              }}
                              labelStyle={{
                                color: "var(--color-muted-foreground)",
                                marginBottom: "4px",
                              }}
                              itemStyle={{
                                color: "var(--color-foreground)",
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke="var(--color-primary)"
                              strokeWidth={2}
                              dot={{ fill: "var(--color-primary)", r: 3 }}
                              activeDot={{ r: 5, fill: "var(--color-foreground)" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
