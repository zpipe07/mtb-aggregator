"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { track } from "@vercel/analytics";
import posthog from "posthog-js";
import type { CategoryTreeNode, Deal, PriceHistoryResponse } from "@/api";
import { isCategoryBrowseRedundantWithBack } from "@/lib/dealsBackHref";
import { dealsListSurfaceFromListHref } from "@/lib/dealsListSurface";
import { computeDealScore, pricePositionLabel } from "@/lib/dealScore";
import { cn, focusRing } from "@/lib/utils";
import { formatMoney } from "@/lib/formatMoney";
import {
  displayPriceRange,
  inStockDealVariants,
  orderedVariantOptionEntries,
  summarizeDealSizeChips,
} from "@/lib/inStockVariantChips";
import { Button } from "@/components/ui/button";
import { RemoteImg } from "@/components/RemoteImg";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { useDealDetailListContext } from "./DealDetailBackNav";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

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
  categoryTree: CategoryTreeNode[];
  categoryBrowseHref?: string;
  categoryBrowseLabel?: string;
};

function VariantOptionBadges({
  options,
  storeSku,
}: {
  options: Record<string, string> | null | undefined;
  storeSku: string;
}) {
  const optionEntries = orderedVariantOptionEntries(options, storeSku);
  if (optionEntries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {optionEntries.map(([k, val]) => (
        <span
          key={k}
          className={cn(
            "inline-flex items-baseline gap-1 rounded-sm border border-foreground/40 bg-card px-2 py-0.5",
            monoMicro,
          )}
        >
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium text-foreground">{val}</span>
        </span>
      ))}
    </div>
  );
}

function DealDetailContentInner({
  deal,
  priceHistory,
  categoryTree,
  categoryBrowseHref,
  categoryBrowseLabel,
}: Props) {
  const viewUrl = deal.affiliate_url || deal.product_url;
  const { backToDealsHref, backToDealsLabel } =
    useDealDetailListContext(categoryTree);
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

  const priceRange = displayPriceRange(deal);
  const savings =
    deal.original_price != null &&
    deal.original_price > deal.current_price &&
    !(priceRange != null && priceRange[0] !== priceRange[1])
      ? deal.original_price - deal.current_price
      : null;

  const chartData =
    (priceHistory?.points ?? []).map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    }));

  const dealScore = computeDealScore(deal, priceHistory);
  const priceLabel = pricePositionLabel(deal, priceHistory);
  const inStockVariants = inStockDealVariants(deal);
  const variantChips = summarizeDealSizeChips(deal);

  useEffect(() => {
    posthog.capture("deal_detail_viewed", {
      deal_id: deal.id,
      store: deal.store_name,
      brand: deal.brand ?? "",
      current_price: deal.current_price,
      discount_pct: discountPct,
      price_dropped: priceHistory?.price_dropped ?? false,
      list_surface: listSurface,
      in_stock_variant_count: inStockVariants.length,
      in_stock_size_count: variantChips?.sizes.length ?? 0,
      in_stock_color_count: variantChips?.colors.length ?? 0,
    });
  }, [
    deal.brand,
    deal.current_price,
    deal.id,
    deal.store_name,
    discountPct,
    inStockVariants.length,
    listSurface,
    priceHistory?.price_dropped,
    variantChips?.colors.length,
    variantChips?.sizes.length,
  ]);

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
            "absolute right-4 top-0 z-10 max-w-[14rem] truncate rounded-t-sm border border-foreground border-b-0 bg-primary px-2 py-0.5",
            monoMicro,
            "tabular-nums text-foreground",
          )}
          title={deal.store_name}
        >
          {"// "}
          {deal.store_name.toUpperCase()}
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
                  <RemoteImg
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
                  {dealScore.score >= 40 ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm border border-foreground/40 bg-primary/15 px-2 py-0.5",
                        monoMicro,
                        "text-foreground",
                      )}
                    >
                      {dealScore.displayLabel.toUpperCase()}
                    </span>
                  ) : null}
                  {priceLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {priceLabel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-5 border-t border-border pt-4">
                <div
                  className={cn(
                    "flex w-full flex-wrap items-end gap-3",
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
                      !priceRange && (
                        <span
                          className={cn(
                            monoMicro,
                            "block tabular-nums text-muted-foreground line-through",
                          )}
                        >
                          was ${formatMoney(deal.original_price)}
                        </span>
                      )}
                    {priceRange != null && priceRange[0] !== priceRange[1] ? (
                      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                        ${formatMoney(priceRange[0])} – $
                        {formatMoney(priceRange[1])}
                      </span>
                    ) : (
                      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                        ${formatMoney(deal.current_price)}
                      </span>
                    )}
                  </div>
                </div>

                <Button asChild className="w-full sm:w-auto" size="lg">
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
                    <span className="relative z-[1] inline-flex items-center gap-2">
                      Snag the Deal
                      <ExternalLink
                        aria-hidden
                        className="size-4 shrink-0"
                        strokeWidth={2.25}
                      />
                      <span className="sr-only"> (opens in new tab)</span>
                    </span>
                  </a>
                </Button>
                {priceRange != null &&
                  priceRange[0] !== priceRange[1] && (
                    <p className={cn(monoMicro, "text-muted-foreground")}>

                      From ${formatMoney(priceRange[0])} to $
                      {formatMoney(priceRange[1])} across in-stock variants
                    </p>
                  )}
                </div>
                {showCategoryChip ? (
                  <p className="mt-4 max-w-full">
                    <Link
                      href={categoryBrowseHref}
                      title={categoryBrowseLabel}
                      className={cn(
                        "inline-block max-w-full truncate rounded-sm font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4",
                        focusRing,
                      )}
                    >
                      More in {categoryBrowseLabel}
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>

            {inStockVariants.length > 0 && (
              <div className="mt-8 border-t border-border pt-8">
                <SectionLabel kicker="// 01" title="In-stock variants" />
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
                      {inStockVariants.map((v) => (
                        <tr
                          key={v.id}
                          className="transition-colors hover:bg-muted/40"
                        >
                          <td className="px-3 py-3 align-top">
                            <VariantOptionBadges
                              options={v.variant_options}
                              storeSku={v.store_sku}
                            />
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
                              {v.is_in_stock ? "In stock" : "Out"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={cn(monoMicro, "mt-3 text-muted-foreground")}>
                  Sold-out sizes are hidden. Open the retailer to pick a
                  variant — this is not a store cart.
                </p>
              </div>
            )}

            {priceHistory && (
              <div className="mt-8 border-t border-border pt-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <SectionLabel kicker="// 02" title="Price history" />
                  <Link
                    href={`/deals/${deal.id}/price-history`}
                    className={cn(
                      "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground",
                      focusRing,
                    )}
                  >
                    Full price tracker →
                  </Link>
                </div>
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
                    <PriceHistoryChart data={chartData} />
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

export function DealDetailContent(props: Props) {
  return <DealDetailContentInner {...props} />;
}
