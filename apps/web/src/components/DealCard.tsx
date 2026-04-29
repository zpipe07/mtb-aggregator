import Link from "next/link";
import { track } from "@vercel/analytics";
import type { Deal } from "../api";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

function formatMoney(n: number) {
  return n.toFixed(2);
}

type DealCardProps = {
  deal: Deal;
  /** When set, the image and product summary navigate to this internal URL (SEO + prefetch). */
  href?: string;
};

/** Corner “CAD crop” ticks — 8px L-marks */
function CardCropMarks() {
  return (
    <div
      className="pointer-events-none absolute inset-3 z-20"
      aria-hidden
    >
      <span className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-foreground/35" />
      <span className="absolute right-0 top-0 h-2 w-2 border-r-2 border-t-2 border-foreground/35" />
      <span className="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-foreground/35" />
      <span className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-foreground/35" />
    </div>
  );
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
    !(deal.price_range?.length === 2 && deal.price_range[0] !== deal.price_range[1])
      ? deal.original_price - deal.current_price
      : null;

  const summary = (
    <>
      {deal.brand && (
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {"// "}
          {deal.brand}
        </span>
      )}
      <h2 className="line-clamp-2 font-medium text-foreground">
        {deal.product_name}
      </h2>
      {deal.category_path && deal.category_path.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {deal.category_path[deal.category_path.length - 1]}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1">
        {savings != null && savings > 0 && (
          <span className="text-lg font-bold tracking-tight text-foreground">
            SAVE ${formatMoney(savings)}
          </span>
        )}
        <div className="flex flex-wrap items-baseline gap-2">
          {deal.price_range != null &&
          deal.price_range.length === 2 &&
          deal.price_range[0] !== deal.price_range[1] ? (
            <span className="text-base font-bold text-foreground">
              ${formatMoney(deal.price_range[0])} – $
              {formatMoney(deal.price_range[1])}
            </span>
          ) : (
            <span className="text-base font-bold text-foreground">
              ${formatMoney(deal.current_price)}
            </span>
          )}
          {deal.original_price != null &&
            deal.original_price > deal.current_price &&
            !(deal.price_range && deal.price_range.length === 2) && (
              <span className="text-sm text-muted-foreground line-through">
                ${formatMoney(deal.original_price)}
              </span>
            )}
        </div>
      </div>
    </>
  );

  const imageBlock = (
    <div className="group/image relative aspect-square overflow-hidden bg-muted">
      {deal.image_url ? (
        <img
          src={deal.image_url}
          alt={deal.product_name}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/card:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          No image
        </div>
      )}
      {discountPct != null && discountPct > 0 && (
        <span
          className={cn(
            "absolute left-2 top-2 -rotate-2 rounded px-2 py-1 font-mono text-xs font-bold uppercase",
            "bg-primary text-primary-foreground shadow-[2px_2px_0_var(--foreground)]",
          )}
        >
          <span className="tabular-nums">{discountPct}</span>
          <span className="font-sans">% off</span>
        </span>
      )}
      <span className="absolute right-2 top-2 rounded bg-trail/92 px-2 py-1 text-xs font-medium text-trail-foreground">
        {deal.store_name}
      </span>
      {deal.variant_count != null && deal.variant_count > 1 && (
        <span className="absolute bottom-2 left-2 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {deal.variant_count} variants
        </span>
      )}
    </div>
  );

  const snagButton = (
    <Button asChild className="mt-4 w-full">
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() =>
          track("view_deal", {
            deal_id: deal.id,
            store: deal.store_name,
            brand: deal.brand || "",
          })
        }
      >
        Snag the Deal
      </a>
    </Button>
  );

  return (
    <Card
      className={cn(
        "group/card relative gap-0 overflow-hidden rounded-[var(--radius)] border border-border bg-card p-0 shadow-sm ring-0 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-foreground hover:shadow-md",
        href ? "" : "cursor-default",
      )}
    >
      <CardCropMarks />
      {href ? (
        <>
          <Link
            href={href}
            className="block rounded-t-[var(--radius)] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() =>
              track("deal_card_click", {
                deal_id: deal.id,
                store: deal.store_name,
                brand: deal.brand || "",
              })
            }
          >
            {imageBlock}
            <CardContent className="py-4 pb-0">{summary}</CardContent>
          </Link>
          <CardContent className="pt-0 pb-4">{snagButton}</CardContent>
        </>
      ) : (
        <>
          {imageBlock}
          <CardContent className="py-4">
            {summary}
            {snagButton}
          </CardContent>
        </>
      )}
    </Card>
  );
}
