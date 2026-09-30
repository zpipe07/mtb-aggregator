import { ExternalLink } from "lucide-react";
import type { Deal } from "../api";
import { TrackedButtonLink, TrackedLink } from "./analytics/TrackedLink";
import { TrackedOutboundButton } from "./analytics/TrackedOutboundAnchor";
import { VariantChips } from "./VariantChips";
import { cn, focusRingWithin } from "@/lib/utils";
import { formatMoney } from "@/lib/formatMoney";
import { computeDealScore } from "@/lib/dealScore";
import type { DealsListSurface } from "@/lib/dealsListSurface";
import { RemoteImg } from "./RemoteImg";
import { summarizeDealSizeChips, displayPriceRange } from "@/lib/inStockVariantChips";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

type DealCardProps = {
  deal: Deal;
  /** When set, the image and product summary navigate to this internal URL (SEO + prefetch). */
  href?: string;
  /** Analytics `list_surface` — parent already knows the route. */
  listSurface: DealsListSurface;
  /** Persist list context before internal navigation (back button on detail page). */
  persistBackHref?: string;
  /** Home page row id for PostHog (`home_section`). */
  homeSection?: string;
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

export function DealCard({
  deal,
  href,
  listSurface,
  persistBackHref,
  homeSection,
}: DealCardProps) {
  const viewUrl = deal.affiliate_url || deal.product_url;

  const variantChips = summarizeDealSizeChips(deal);
  const priceRange = displayPriceRange(deal);
  const analyticsBase = {
    deal_id: deal.id,
    store: deal.store_name,
    brand: deal.brand || "",
    list_surface: listSurface,
    in_stock_size_count: variantChips?.sizes.length ?? 0,
    in_stock_color_count: variantChips?.colors.length ?? 0,
    ...(homeSection ? { home_section: homeSection } : {}),
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
    !(priceRange != null && priceRange[0] !== priceRange[1])
      ? deal.original_price - deal.current_price
      : null;

  const priceRow = (
    <div
      className={cn(
        "mt-auto flex items-end gap-3 border-t border-border pt-3",
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
          !priceRange && (
            <span
              className={cn(
                monoMicro,
                "text-muted-foreground block tabular-nums line-through",
              )}
            >
              was ${formatMoney(deal.original_price)}
            </span>
          )}
        {priceRange != null && priceRange[0] !== priceRange[1] ? (
          <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground sm:text-2xl">
            ${formatMoney(priceRange[0])} – $
            {formatMoney(priceRange[1])}
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
    <div className="flex flex-1 flex-col gap-3 p-4 pb-0">
      <div className="flex flex-col gap-1.5">
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
      {variantChips ? (
        <VariantChips deal={deal} density="compact" className="w-full" />
      ) : null}
      {priceRow}
    </div>
  );

  const snagButton = (
    <TrackedOutboundButton
      href={viewUrl}
      size="lg"
      buttonClassName="w-full"
      stopClickPropagation
      vercelEvent="view_deal"
      vercelProperties={analyticsBase}
      event="deal_outbound_click"
      properties={{
        ...analyticsBase,
        brand: deal.brand ?? "",
        cta: "snag_retailer",
      }}
    >
      <SnagRetailerLabel />
    </TrackedOutboundButton>
  );

  const footer = (
    <div className="mt-auto px-4 pb-4 pt-3">
      {href ? (
        <div className="flex flex-col gap-2">
          {snagButton}
          <TrackedButtonLink
            href={href}
            variant="outline"
            size="lg"
            buttonClassName="w-full"
            className="inline-flex"
            aria-label="View details — price history, specs, variants, and retailer link"
            title="Price history, specs, variants — open the full listing."
            stopClickPropagation
            persistBackHref={persistBackHref}
            vercelEvent="deal_card_click"
            vercelProperties={analyticsBase}
            event="deal_card_click"
            properties={{
              ...analyticsBase,
              brand: deal.brand ?? "",
              cta: "view_details",
            }}
          >
            View details
          </TrackedButtonLink>
        </div>
      ) : (
        snagButton
      )}
    </div>
  );

  const imageBlock = (
    <div className="group/image relative aspect-[16/9] overflow-hidden border-b border-foreground bg-muted sm:aspect-square">
      {deal.image_url ? (
        <RemoteImg
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
      {(showScore ||
        (!variantChips &&
          deal.variant_count != null &&
          deal.variant_count > 1)) && (
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
          {showScore ? (
            <span
              className={cn(
                "inline-block rounded-sm border border-foreground/40 bg-card/90 px-2 py-0.5 backdrop-blur-sm",
                monoMicro,
                "text-foreground",
              )}
            >
              {dealScore.displayLabel}
            </span>
          ) : null}
          {!variantChips &&
          deal.variant_count != null &&
          deal.variant_count > 1 ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-foreground/40 bg-card/90 px-2 py-0.5 backdrop-blur-sm",
                monoMicro,
              )}
            >
              <span className="tabular-nums">{deal.variant_count}</span>
              <span className="text-muted-foreground">variants</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-full w-full flex-col self-stretch pt-3 rounded-sm",
        focusRingWithin,
      )}
    >
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
          "group/card relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-sm border border-foreground bg-card transition-transform duration-200",
          "hover:-translate-y-0.5",
          href ? "" : "cursor-default",
        )}
      >
        <CardCropMarks />
        {href ? (
          <>
            <TrackedLink
              href={href}
              className="flex min-h-0 flex-1 flex-col rounded-sm text-left outline-none"
              persistBackHref={persistBackHref}
              vercelEvent="deal_card_click"
              properties={analyticsBase}
            >
              {imageBlock}
              {body}
            </TrackedLink>
            {footer}
          </>
        ) : (
          <>
            {imageBlock}
            <div className="flex min-h-0 flex-1 flex-col">
              {body}
              {footer}
            </div>
          </>
        )}
      </article>
    </div>
  );
}
