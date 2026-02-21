import type { Deal } from "../api";

type DealCardProps = {
  deal: Deal;
};

export function DealCard({ deal }: DealCardProps) {
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
    <article className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-stone-200 relative">
        {deal.image_url ? (
          <img
            src={deal.image_url}
            alt={deal.product_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
            No image
          </div>
        )}
        {discountPct != null && discountPct > 0 && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
            {discountPct}% off
          </span>
        )}
        <span className="absolute top-2 right-2 bg-stone-800/80 text-white text-xs px-2 py-1 rounded">
          {deal.store_name}
        </span>
      </div>
      <div className="p-4">
        {deal.brand && (
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            {deal.brand}
          </span>
        )}
        <h2 className="font-medium text-stone-900 line-clamp-2">
          {deal.product_name}
        </h2>
        {deal.category_path && deal.category_path.length > 0 && (
          <p className="text-xs text-stone-500 mt-1">
            {deal.category_path[deal.category_path.length - 1]}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-stone-900">
            ${deal.current_price.toFixed(2)}
          </span>
          {deal.original_price != null &&
            deal.original_price > deal.current_price && (
              <span className="text-sm text-stone-500 line-through">
                ${deal.original_price.toFixed(2)}
              </span>
            )}
        </div>
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full text-center bg-stone-800 hover:bg-stone-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          View Deal
        </a>
      </div>
    </article>
  );
}
