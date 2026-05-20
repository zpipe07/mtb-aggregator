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
import { isCategoryBrowseRedundantWithBack } from "@/lib/dealsBackHref";
import { dealsListSurfaceFromListHref } from "@/lib/dealsListSurface";
import { cn, focusRing } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

function skuForTab(deal: Deal) {
  const raw = deal.store_sku?.trim();
  if (!raw) return `#${deal.id}`;
  return raw.length <= 18 ? raw : `${raw.slice(0, 16)}…`;
}

function CardCropMarks() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1.5 top-1.5 z-10 size-3 border-l border-t border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 size-3 border-b border-r border-foreground"
      />
    </>
  );
}

function SectionLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <span className={cn(monoMicro, "text-muted-foreground pb-0.5")}>
        {kicker}
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <span className="mb-0.5 h-px min-w-8 flex-1 max-w-xs bg-border" />
    </div>
  );
}

type Props = {
  deal: Deal;
  priceHistory?: PriceHistoryResponse | null;
  backToDealsHref?: string;
  backToDealsLabel?: string;
  categoryBrowseHref?: string;
  categoryBrowseLabel?: string;
};

export function DealDetailContent({
  deal,
  priceHistory,
  backToDealsHref = "/deals",
  backToDealsLabel = "← Back to deals",
  categoryBrowseHref,
  categoryBrowseLabel,
}: Props) {
  const viewUrl = deal.affiliate_url || deal.product_url;
  const listSurface = dealsListSurfaceFromListHref(backToDealsHref);
  const showCategoryChip =
    categoryBrowseHref != null &&
    categoryBrowseLabel != null &&
    !isCategoryBrowseRedundantWithBack(backToDealsHref, categoryBrowseHref);
  const discountPct =
    deal.discount_pct != null
      ? Math.round(deal.discount_pct)
      : deal.original_price != null &&
          deal.original_price > 0 &&
          deal.original_price > deal.current_price
        ? Math.round((1 - deal.current_price / deal.original_price) * 100)
        : null;

  const savings =
    deal.original_price != null &&
    deal.original_price > deal.current_price &&
    !(
      deal.price_range?.length === 2 &&
      deal.price_range[0] !== deal.price_range[1]
    )
      ? deal.original_price - deal.current_price
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
      list_surface: listSurface,
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Deal navigation" className="mb-6">
        <Link
          href={backToDealsHref}
          className={cn(
            "inline-block rounded-sm font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          {backToDealsLabel}
        </Link>
      </nav>

      <div className="relative pt-3">
        <span
          className={cn(
            "absolute right-4 top-0 z-10 max-w-[10rem] truncate rounded-t-sm border border-foreground border-b-0 bg-primary px-2 py-0.5 tabular-nums text-foreground",
            monoMicro,
          )}
          title={deal.store_sku || undefined}
        >
          {"// "}
          {skuForTab(deal)}
        </span>

        <article
          className={cn(
            "relative overflow-hidden rounded-sm border border-foreground bg-card",
            "shadow-sm transition-shadow hover:shadow-md",
          )}
        >
          <CardCropMarks />
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
              <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-sm border border-foreground bg-muted sm:mx-0 sm:w-44">
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
                <h1 className="mt-1 text-2xl font-semibold leading-snug tracking-tight text-foreground">
                  {deal.product_name}
                </h1>
                <p className={cn(monoMicro, "mt-2 text-muted-foreground")}>
                  {"// "}
                  {deal.store_name.toUpperCase()}
                </p>

                {showCategoryChip ? (
                  <div className="mt-3 max-w-full">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={categoryBrowseHref}
                        title={categoryBrowseLabel}
                        className={cn("max-w-full truncate", focusRing)}
                      >
                        More in {categoryBrowseLabel}
                      </Link>
                    </Button>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
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
                      deal.original_price > deal.current_price &&
                      !(deal.price_range && deal.price_range.length === 2) && (
                        <span
                          className={cn(
                            monoMicro,
                            "block tabular-nums text-muted-foreground line-through",
                          )}
                        >
                          was ${formatMoney(deal.original_price)}
                        </span>
                      )}
                    {deal.price_range != null &&
                    deal.price_range.length === 2 &&
                    deal.price_range[0] !== deal.price_range[1] ? (
                      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                        ${formatMoney(deal.price_range[0])} – $
                        {formatMoney(deal.price_range[1])}
                      </span>
                    ) : (
                      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                        ${formatMoney(deal.current_price)}
                      </span>
                    )}
                  </div>
                </div>

                <Button asChild className="mt-5">
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      track("view_at_store", {
                        deal_id: deal.id,
                        store: deal.store_name,
                        brand: deal.brand ?? "",
                        list_surface: listSurface,
                      });
                      posthog.capture("deal_outbound_click", {
                        deal_id: deal.id,
                        store: deal.store_name,
                        brand: deal.brand ?? "",
                        list_surface: listSurface,
                        cta: "snag_retailer",
                      });
                    }}
                  >
                    <span className="relative z-[1]">Snag the Deal</span>
                  </a>
                </Button>
                {deal.price_range != null &&
                  deal.price_range.length === 2 &&
                  deal.price_range[0] !== deal.price_range[1] && (
                    <p className={cn(monoMicro, "mt-3 text-muted-foreground")}>
                      From ${formatMoney(deal.price_range[0])} to $
                      {formatMoney(deal.price_range[1])} across variants
                    </p>
                  )}
              </div>
            </div>

            {deal.variants != null && deal.variants.length > 1 && (
              <div className="mt-8 border-t border-border pt-8">
                <SectionLabel kicker="// 01" title="Variants" />
                <div className="overflow-x-auto rounded-sm border border-foreground bg-card">
                  <table className="w-full min-w-[min(100%,20rem)] text-sm">
                    <thead>
                      <tr className="border-b border-foreground bg-secondary/80 text-left">
                        <th
                          className={cn(
                            monoMicro,
                            "px-3 py-2.5 font-semibold text-foreground",
                          )}
                        >
                          Options
                        </th>
                        <th
                          className={cn(
                            monoMicro,
                            "px-3 py-2.5 text-right font-semibold text-foreground",
                          )}
                        >
                          Price
                        </th>
                        <th
                          className={cn(
                            monoMicro,
                            "w-[7.5rem] px-3 py-2.5 text-right font-semibold text-foreground",
                          )}
                        >
                          Availability
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {deal.variants.map((v) => (
                        <tr
                          key={v.id}
                          className="transition-colors hover:bg-muted/40"
                        >
                          <td className="px-3 py-3 align-top">
                            {v.variant_options &&
                            Object.keys(v.variant_options).length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(v.variant_options).map(
                                  ([k, val]) => (
                                    <span
                                      key={k}
                                      className={cn(
                                        "inline-flex items-baseline gap-1 rounded-sm border border-foreground/40 bg-card px-2 py-0.5",
                                        monoMicro,
                                      )}
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
                            <span className="font-mono font-semibold text-foreground">
                              ${v.current_price.toFixed(2)}
                            </span>
                            {v.original_price != null &&
                              v.original_price > v.current_price && (
                                <span className="font-mono text-xs text-muted-foreground line-through block">
                                  ${v.original_price.toFixed(2)}
                                </span>
                              )}
                          </td>
                          <td className="px-3 py-3 align-top text-right">
                            <span
                              className={cn(
                                "inline-flex rounded-sm border px-2 py-0.5",
                                monoMicro,
                                v.is_in_stock
                                  ? "border-foreground/40 bg-primary/15 text-foreground"
                                  : "border-border bg-muted text-muted-foreground",
                              )}
                            >
                              {v.is_in_stock ? "IN STOCK" : "OUT"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={cn(monoMicro, "mt-3 text-muted-foreground")}>
                  Prices and availability are from the retailer; open the deal
                  to select a variant on the store site.
                </p>
              </div>
            )}

            {priceHistory && (
              <div className="mt-8 border-t border-border pt-8">
                <SectionLabel kicker="// 02" title="Price history" />
                {chartData.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No history yet.
                  </p>
                )}
                {chartData.length === 1 && (
                  <p className="text-sm text-muted-foreground">
                    One price recorded: ${chartData[0].price.toFixed(2)} on{" "}
                    {formatDate(chartData[0].recorded_at)}.
                  </p>
                )}
                {chartData.length >= 2 && (
                  <>
                    <div className="mb-4 flex flex-wrap gap-4 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
                    <div className="h-64 w-full rounded-sm border border-foreground/40 bg-card/50 p-2">
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
                              boxShadow:
                                "var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.06))",
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
                            activeDot={{
                              r: 5,
                              fill: "var(--color-foreground)",
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
