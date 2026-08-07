import type { Deal } from "../api";
import { DealCard } from "./DealCard";

type DealGridProps = {
  deals: Deal[];
  /** Builds internal detail URLs for each card (SEO + prefetch). Omit for display-only cards. */
  getHref?: (deal: Deal) => string;
  /** Called before navigating to a deal detail page (e.g. persist back context). */
  onDealNavigate?: () => void;
};

export function DealGrid({ deals, getHref, onDealNavigate }: DealGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {deals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          href={getHref?.(deal)}
          onInternalNavigate={onDealNavigate}
        />
      ))}
    </div>
  );
}
