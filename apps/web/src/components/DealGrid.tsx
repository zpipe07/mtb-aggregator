import type { Deal } from "../api";
import { DealCard } from "./DealCard";

type DealGridProps = {
  deals: Deal[];
  onSelectDeal?: (deal: Deal) => void;
};

export function DealGrid({ deals, onSelectDeal }: DealGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} onSelect={onSelectDeal} />
      ))}
    </div>
  );
}
