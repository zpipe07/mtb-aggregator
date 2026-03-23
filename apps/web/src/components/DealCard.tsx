import { track } from "@vercel/analytics";
import type { Deal } from "../api";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

type DealCardProps = {
  deal: Deal;
  onSelect?: (deal: Deal) => void;
};

export function DealCard({ deal, onSelect }: DealCardProps) {
  const viewUrl = deal.affiliate_url || deal.product_url;
  // Compute discount % from API value or derive from original_price/current_price
  const discountPct =
    deal.discount_pct != null
      ? Math.round(deal.discount_pct)
      : deal.original_price != null &&
          deal.original_price > 0 &&
          deal.original_price > deal.current_price
        ? Math.round((1 - deal.current_price / deal.original_price) * 100)
        : null;

  return (
    <Card
      className="overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-card p-0"
      onClick={() => {
        if (onSelect) {
          track("deal_card_click", {
            deal_id: deal.id,
            store: deal.store_name,
            brand: deal.brand || "",
          });
          onSelect(deal);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter") {
                track("deal_card_click", {
                  deal_id: deal.id,
                  store: deal.store_name,
                  brand: deal.brand || "",
                });
                onSelect(deal);
              }
            }
          : undefined
      }
    >
      <div className="aspect-square bg-muted relative">
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
        {discountPct != null && discountPct > 0 && (
          <span className="absolute top-2 left-2 bg-destructive text-white text-xs font-semibold px-2 py-1 rounded">
            {discountPct}% off
          </span>
        )}
        <span className="absolute top-2 right-2 bg-trail/92 text-trail-foreground text-xs font-medium px-2 py-1 rounded">
          {deal.store_name}
        </span>
        {deal.variant_count != null && deal.variant_count > 1 && (
          <span className="absolute bottom-2 left-2 bg-secondary text-secondary-foreground text-xs font-medium px-2 py-1 rounded">
            {deal.variant_count} variants
          </span>
        )}
      </div>
      <CardContent className="py-4">
        {deal.brand && (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {deal.brand}
          </span>
        )}
        <h2 className="font-medium text-foreground line-clamp-2">
          {deal.product_name}
        </h2>
        {deal.category_path && deal.category_path.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {deal.category_path[deal.category_path.length - 1]}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          {deal.price_range != null &&
          deal.price_range.length === 2 &&
          deal.price_range[0] !== deal.price_range[1] ? (
            <span className="text-lg font-bold text-foreground">
              ${deal.price_range[0].toFixed(2)} – $
              {deal.price_range[1].toFixed(2)}
            </span>
          ) : (
            <span className="text-lg font-bold text-foreground">
              ${deal.current_price.toFixed(2)}
            </span>
          )}
          {deal.original_price != null &&
            deal.original_price > deal.current_price &&
            !(deal.price_range && deal.price_range.length === 2) && (
              <span className="text-sm text-muted-foreground line-through">
                ${deal.original_price.toFixed(2)}
              </span>
            )}
        </div>
        <Button asChild className="mt-4 w-full">
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
            Snag the Deal
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
