"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import posthog from "posthog-js";
import { track } from "@vercel/analytics";
import type { Deal } from "../api";
import { Button } from "./ui/button";
import { cn, focusRingWithin } from "@/lib/utils";
import { computeDealScore } from "@/lib/dealScore";
import { dealsListSurfaceFromPathname } from "@/lib/dealsListSurface";

function formatMoney(n: number) {
  return n.toFixed(2);
}

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

type DealCardProps = {
  deal: Deal;
  /** When set, the image and product summary navigate to this internal URL (SEO + prefetch). */
  href?: string;
  /** Persist list context before internal navigation (back button on detail page). */
  onInternalNavigate?: () => void;
};

function CardCropMarks() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1.5 top-1.5 z-20 size-3 border-l border-t border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 size-3 border-b border-r border-foreground"
      />
    </>
  );
}

function SnagRetailerLabel({ label = "Snag this deal" }: { label?: string }) {
  return (
    <span className="relative z-[1] inline-flex items-center gap-1.5">
      {label}
      <ExternalLink
        aria-hidden
        className="size-3.5 shrink-0"
        strokeWidth={2.25}
      />
      <span className="sr-only"> (opens in new tab)</span>
    </span>
  );
}

export function DealCard({ deal, href, onInternalNavigate }: DealCardProps) {
  const pathname = usePathname();
  const listSurface = dealsListSurfaceFromPathname(pathname);
  const viewUrl = deal.affiliate_url || deal.product_url;

  const handleInternalNavigate = () => {
    onInternalNavigate?.();
    track("deal_card_click", {
      deal_id: deal.id,
      store: deal.store_name,
      brand: deal.brand || "",
      list_surface: listSurface,
    });
  };
  const discountPct =
    deal.discount_pct != null
      ? Math.round(deal.discount_pct)
      : deal.original_price != null &&
          deal.original_price > 0 &&
          deal.original_price > deal.current_price
        ? Math.round((1 - deal.current_price / deal.original_price) * 100)
        : null;

  const dealScore = computeDealScore(deal);
  const showScore = dealScore.score >= 40;

  const savings =
    deal.original_price != null &&
    deal.original_price > deal.current_price &&
    !(
      deal.price_range?.length === 2 &&
      deal.price_range[0] !== deal.price_range[1]
    )
      ? deal.original_price - deal.current_price
      : null;

  const priceRow = (
    <div
      className={cn(
        "flex items-end gap-3 border-t border-border pt-3",
        savings != null && savings > 0 ? "justify-between" : "justify-end",
      )}
    >
      {savings != null && savings > 0 ? (
        <div className="min-w-0 space-y-0.5">
          <span className={cn(monoMicro, "text-muted-foreground block")}>
            save
          </span>
          <span className="font-mono text-sm font-medium leading-none tabular-nums text-muted-foreground">
            ${formatMoney(savings)}
          </span>
        </div>
      ) : null}
      <div className="space-y-0.5 text-right">
        {deal.original_price != null &&
          deal.original_price > deal.current_price &&
          !(deal.price_range && deal.price_range.length === 2) && (
            <span
              className={cn(
                monoMicro,
                "text-muted-foreground block tabular-nums line-through",
              )}
            >
              was ${formatMoney(deal.original_price)}
            </span>
          )}
        {deal.price_range != null &&
        deal.price_range.length === 2 &&
        deal.price_range[0] !== deal.price_range[1] ? (
          <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground sm:text-2xl">
            ${formatMoney(deal.price_range[0])} – $
            {formatMoney(deal.price_range[1])}
          </span>
        ) : (
          <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground sm:text-2xl">
            ${formatMoney(deal.current_price)}
          </span>
        )}
      </div>
    </div>
  );

  const body = (
    <div className="space-y-3 p-4 pb-0">
      <div className="space-y-1.5">
        {deal.brand && (
          <div className={cn(monoMicro, "text-muted-foreground")}>
            {"// "}
            {deal.brand}
          </div>
        )}
        <h2 className="line-clamp-2 text-base font-medium leading-snug tracking-tight text-foreground">
          {deal.product_name}
        </h2>
      </div>
      {priceRow}
    </div>
  );

  const footer = (
    <div className="px-4 pb-4 pt-3">
      {href ? (
        <>
          <div className="flex flex-col gap-2">
            <Button asChild size="lg" className="w-full">
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  track("view_deal", {
                    deal_id: deal.id,
                    store: deal.store_name,
                    brand: deal.brand || "",
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
                <SnagRetailerLabel />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link
                href={href}
                className="inline-flex"
                aria-label="View details — price history, specs, variants, and retailer link"
                title="Price history, specs, variants — open the full listing."
                onClick={(e) => {
                  e.stopPropagation();
                  handleInternalNavigate();
                  posthog.capture("deal_card_click", {
                    cta: "view_details",
                    deal_id: deal.id,
                    store: deal.store_name,
                    brand: deal.brand ?? "",
                    list_surface: listSurface,
                  });
                }}
              >
                View details
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <Button asChild size="lg" className="w-full">
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              track("view_deal", {
                deal_id: deal.id,
                store: deal.store_name,
                brand: deal.brand || "",
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
            <SnagRetailerLabel />
          </a>
        </Button>
      )}
    </div>
  );

  const imageBlock = (
    <div className="group/image relative aspect-[16/9] overflow-hidden border-b border-foreground bg-muted sm:aspect-square">
      {deal.image_url ? (
        <img
          src={deal.image_url}
          alt={deal.product_name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          No image
        </div>
      )}
      {discountPct != null && discountPct > 0 && (
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          <span
            className={cn(
              "inline-block rounded-sm bg-primary px-2 py-1 font-mono text-sm font-semibold tabular-nums text-foreground",
              "shadow-[2px_2px_0_var(--foreground)]",
            )}
            style={{ transform: "rotate(-2deg)" }}
          >
            −{discountPct}%
          </span>
          {showScore ? (
            <span
              className={cn(
                "inline-block w-fit rounded-sm border border-foreground/40 bg-card/95 px-2 py-0.5",
                monoMicro,
                "text-foreground backdrop-blur-sm",
              )}
            >
              {dealScore.displayLabel}
            </span>
          ) : null}
        </div>
      )}
      {deal.variant_count != null && deal.variant_count > 1 && (
        <div className="absolute bottom-3 right-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border border-foreground/40 bg-card/90 px-2 py-0.5 backdrop-blur-sm",
              monoMicro,
            )}
          >
            <span className="tabular-nums">{deal.variant_count}</span>
            <span className="text-muted-foreground">variants</span>
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("relative pt-3 rounded-sm", focusRingWithin)}>
      <span
        className={cn(
          "absolute right-4 top-0 z-10 max-w-[8.5rem] truncate rounded-t-sm border border-foreground border-b-0 bg-primary px-2 py-0.5",
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
          "group/card relative overflow-hidden rounded-sm border border-foreground bg-card transition-transform duration-200",
          "hover:-translate-y-0.5",
          href ? "" : "cursor-default",
        )}
      >
        <CardCropMarks />
        {href ? (
          <>
            <Link
              href={href}
              className="block rounded-sm text-left outline-none"
              onClick={handleInternalNavigate}
            >
              {imageBlock}
              {body}
            </Link>
            {footer}
          </>
        ) : (
          <>
            {imageBlock}
            <div className="space-y-0">
              {body}
              {footer}
            </div>
          </>
        )}
      </article>
    </div>
  );
}
