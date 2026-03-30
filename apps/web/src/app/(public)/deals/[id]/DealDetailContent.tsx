"use client";

import { useEffect } from "react";
import Link from "next/link";
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
import posthog from "posthog-js";
import type { Deal } from "@/api";
import type { PriceHistoryResponse } from "@/api";
import { cn } from "@/lib/utils";

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

type Props = {
  deal: Deal;
  priceHistory?: PriceHistoryResponse | null;
  /** Preserves `/deals` query when opening a deal from the filtered list (`?from=`). */
  backToDealsHref?: string;
  /** When `canonical_category` resolves, link to `/deals/c/...` for internal SEO. */
  categoryBrowseHref?: string;
  categoryBrowseLabel?: string;
};

export function DealDetailContent({
  deal,
  priceHistory,
  backToDealsHref = "/deals",
  categoryBrowseHref,
  categoryBrowseLabel,
}: Props) {
  const viewUrl = deal.affiliate_url || deal.product_url;
  const discountPct =
    deal.discount_pct != null
      ? Math.round(deal.discount_pct)
      : deal.original_price != null &&
          deal.original_price > 0 &&
          deal.original_price > deal.current_price
        ? Math.round((1 - deal.current_price / deal.original_price) * 100)
        : null;

  const chartData =
    priceHistory?.points.map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  useEffect(() => {
    posthog.capture("deal_detail_viewed", {
      deal_id: deal.id,
      store: deal.store_name,
      brand: deal.brand ?? "",
      current_price: deal.current_price,
      discount_pct: discountPct,
      price_dropped: priceHistory?.price_dropped ?? false,
    });
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 space-y-2">
        <Link
          href={backToDealsHref}
          className="text-sm text-muted-foreground hover:text-foreground inline-block"
        >
          ← Back to deals
        </Link>
        {categoryBrowseHref && categoryBrowseLabel ? (
          <p className="text-sm text-muted-foreground">
            <Link
              href={categoryBrowseHref}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {categoryBrowseLabel}
            </Link>
            <span className="font-normal"> — more deals in this category</span>
          </p>
        ) : null}
      </div>

      <div className="bg-card rounded-xl shadow-lg border border-border overflow-hidden">
        <div className="p-6">
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
              <h1 className="font-semibold text-foreground text-xl mt-0.5">
                {deal.product_name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {deal.store_name}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  ${deal.current_price.toFixed(2)}
                </span>
                {deal.original_price != null &&
                  deal.original_price > deal.current_price && (
                    <span className="text-base text-muted-foreground line-through">
                      ${deal.original_price.toFixed(2)}
                    </span>
                  )}
                {discountPct != null && discountPct > 0 && (
                  <span className="bg-red-100 text-red-800 text-sm font-medium px-2 py-0.5 rounded dark:bg-red-900/30 dark:text-red-400">
                    {discountPct}% off
                  </span>
                )}
                {priceHistory?.price_dropped && (
                  <span className="bg-emerald-100 text-emerald-800 text-sm font-medium px-2 py-0.5 rounded dark:bg-emerald-900/30 dark:text-emerald-400">
                    Price dropped
                  </span>
                )}
              </div>
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block bg-primary text-primary-foreground font-medium py-2 px-4 rounded-lg transition-colors hover:bg-primary/90"
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
              {deal.price_range != null &&
                deal.price_range.length === 2 &&
                deal.price_range[0] !== deal.price_range[1] && (
                  <p className="text-sm text-muted-foreground mt-2">
                    From ${deal.price_range[0].toFixed(2)} to $
                    {deal.price_range[1].toFixed(2)} across variants
                  </p>
                )}
            </div>
          </div>

          {deal.variants != null && deal.variants.length > 1 && (
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="font-medium text-foreground mb-3">Variants</h2>
              <div className="overflow-x-auto rounded-xl border border-border bg-muted/20">
                <table className="w-full min-w-[min(100%,20rem)] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Options</th>
                      <th className="px-3 py-2.5 font-medium text-right">
                        Price
                      </th>
                      <th className="px-3 py-2.5 font-medium text-right w-[7.5rem]">
                        Availability
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80">
                    {deal.variants.map((v) => (
                      <tr
                        key={v.id}
                        className="transition-colors hover:bg-muted/30"
                      >
                        <td className="px-3 py-3 align-top">
                          {v.variant_options &&
                          Object.keys(v.variant_options).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(v.variant_options).map(
                                ([k, val]) => (
                                  <span
                                    key={k}
                                    className="inline-flex items-baseline gap-1 rounded-md border border-border/80 bg-background/80 px-2 py-1 text-xs shadow-sm"
                                  >
                                    <span className="text-muted-foreground">
                                      {k}
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {val}
                                    </span>
                                  </span>
                                ),
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums">
                          <span className="font-semibold text-foreground">
                            ${v.current_price.toFixed(2)}
                          </span>
                          {v.original_price != null &&
                            v.original_price > v.current_price && (
                              <span className="block text-xs text-muted-foreground line-through">
                                ${v.original_price.toFixed(2)}
                              </span>
                            )}
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              v.is_in_stock
                                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {v.is_in_stock ? "In stock" : "Out of stock"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Prices and availability are from the retailer; open the deal to
                select a variant on the store site.
              </p>
            </div>
          )}

          {priceHistory && (
            <div className="mt-8">
              <h2 className="font-medium text-foreground mb-3">
                Price history
              </h2>
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
                      Lowest:{" "}
                      <strong>${priceHistory.lowest_price.toFixed(2)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Highest:{" "}
                      <strong>${priceHistory.highest_price.toFixed(2)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Average:{" "}
                      <strong>${priceHistory.avg_price.toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="h-64 w-full">
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
                          tick={{ fontSize: 12 }}
                          stroke="var(--color-muted-foreground)"
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
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
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="var(--color-foreground)"
                          strokeWidth={2}
                          dot={{ fill: "var(--color-foreground)", r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
