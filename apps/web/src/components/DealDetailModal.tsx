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

type DealDetailModalProps = {
  dealId: number | null;
  onClose: () => void;
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
        ? Math.round((1 - (deal.current_price ?? 0) / deal.original_price) * 100)
        : null;

  const chartData =
    priceHistory?.points.map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 id="deal-modal-title" className="text-lg font-semibold text-foreground truncate pr-4">
            Deal details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="Close"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          )}
          {isError && (
            <div className="py-6 text-red-600">{error?.message ?? "Failed to load"}</div>
          )}
          {!loading && !isError && deal && (
            <>
              <div className="flex gap-6 flex-wrap">
                <div className="w-40 h-40 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
                  {deal.image_url ? (
                    <img
                      src={deal.image_url}
                      alt={deal.product_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {deal.brand && (
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {deal.brand}
                    </span>
                  )}
                  <h3 className="font-semibold text-foreground text-lg mt-0.5">
                    {deal.product_name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{deal.store_name}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      ${deal.current_price.toFixed(2)}
                    </span>
                    {deal.original_price != null && deal.original_price > deal.current_price && (
                      <span className="text-base text-muted-foreground line-through">
                        ${deal.original_price.toFixed(2)}
                      </span>
                    )}
                    {discountPct != null && discountPct > 0 && (
                      <span className="bg-red-100 text-red-800 text-sm font-medium px-2 py-0.5 rounded">
                        {discountPct}% off
                      </span>
                    )}
                    {priceHistory?.price_dropped && (
                      <span className="bg-emerald-100 text-emerald-800 text-sm font-medium px-2 py-0.5 rounded">
                        Price dropped
                      </span>
                    )}
                  </div>
                  <Button asChild className="mt-4">
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
                      Snag the Deal
                    </a>
                  </Button>
                </div>
              </div>

              {priceHistory && (
                <div className="mt-8">
                  <h4 className="font-medium text-foreground mb-3">Price history</h4>
                  {chartData.length === 0 && (
                    <p className="text-muted-foreground text-sm">No history yet.</p>
                  )}
                  {chartData.length === 1 && (
                    <p className="text-muted-foreground text-sm">
                      One price recorded: ${chartData[0].price.toFixed(2)} on{" "}
                      {formatDate(chartData[0].recorded_at)}.
                    </p>
                  )}
                  {chartData.length >= 2 && (
                    <>
                      <div className="flex flex-wrap gap-4 text-sm mb-3">
                        <span className="text-muted-foreground">
                          Lowest: <strong>${priceHistory.lowest_price.toFixed(2)}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Highest: <strong>${priceHistory.highest_price.toFixed(2)}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Average: <strong>${priceHistory.avg_price.toFixed(2)}</strong>
                        </span>
                      </div>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="dateLabel"
                              tick={{ fontSize: 12 }}
                              stroke="#78716c"
                            />
                            <YAxis
                              tick={{ fontSize: 12 }}
                              stroke="#78716c"
                              tickFormatter={(v) => `$${v}`}
                              domain={["dataMin - 5", "dataMax + 5"]}
                            />
                            <Tooltip
                              formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
                              labelFormatter={(_, payload) =>
                                payload?.[0]?.payload?.recorded_at
                                  ? formatDate(payload[0].payload.recorded_at)
                                  : ""
                              }
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke="#57534e"
                              strokeWidth={2}
                              dot={{ fill: "#57534e", r: 3 }}
                              activeDot={{ r: 5 }}
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
