import type { Deal } from "../api";
import type { DealsListSurface } from "@/lib/dealsListSurface";
import { DealCard } from "./DealCard";

type DealGridProps = {
  deals: Deal[];
  /** Builds internal detail URLs for each card (SEO + prefetch). Omit for display-only cards. */
  getHref?: (deal: Deal) => string;
  listSurface: DealsListSurface;
  persistBackHref?: string;
};

export function DealGrid({
  deals,
  getHref,
  listSurface,
  persistBackHref,
}: DealGridProps) {
  return (
    <div className="grid grid-cols-1 items-stretch sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {deals.map((deal) => (
        <div key={deal.id} className="flex h-full min-h-0 flex-col">
          <DealCard
            deal={deal}
            href={getHref?.(deal)}
            listSurface={listSurface}
            persistBackHref={persistBackHref}
          />
        </div>
      ))}
    </div>
  );
}
