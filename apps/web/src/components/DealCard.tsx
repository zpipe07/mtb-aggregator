import Link from "next/link";
import { track } from "@vercel/analytics";
import type { Deal } from "../api";
import { Button } from "./ui/button";
import { cn, focusRingWithin } from "@/lib/utils";

function formatMoney(n: number) {
  return n.toFixed(2);
}

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

type DealCardProps = {
  deal: Deal;
  /** When set, the image and product summary navigate to this internal URL (SEO + prefetch). */
  href?: string;
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

function skuForTab(deal: Deal) {
  const raw = deal.store_sku?.trim();
  if (!raw) return `#${deal.id}`;
  return raw.length <= 14 ? raw : `${raw.slice(0, 12)}…`;
}

export function DealCard({ deal, href }: DealCardProps) {
  const viewUrl = deal.affiliate_url || deal.product_url;
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
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
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
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            ${formatMoney(deal.price_range[0])} – $
            {formatMoney(deal.price_range[1])}
          </span>
        ) : (
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
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
    <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-3">
      <span className={cn(monoMicro, "min-w-0 truncate text-muted-foreground")}>
        {"// "}
        {deal.store_name.toUpperCase()}
      </span>
      <Button asChild size="xs" className="shrink-0">
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
            });
          }}
        >
          <span className="relative z-[1]">Snag</span>
        </a>
      </Button>
    </div>
  );

  const imageBlock = (
    <div className="group/image relative aspect-square overflow-hidden border-b border-foreground bg-muted">
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
        <div className="absolute left-3 top-3">
          <span
            className={cn(
              "inline-block rounded-sm bg-primary px-2 py-1 font-mono text-sm font-semibold tabular-nums text-foreground",
              "shadow-[2px_2px_0_var(--foreground)]",
            )}
            style={{ transform: "rotate(-2deg)" }}
          >
            −{discountPct}%
          </span>
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
        title={deal.store_sku || undefined}
      >
        {"// "}
        {skuForTab(deal)}
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
              onClick={() =>
                track("deal_card_click", {
                  deal_id: deal.id,
                  store: deal.store_name,
                  brand: deal.brand || "",
                })
              }
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
