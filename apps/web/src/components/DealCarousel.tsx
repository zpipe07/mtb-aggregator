import type { Deal } from "../api";
import { DealCard } from "./DealCard";
import { cn } from "@/lib/utils";

type DealCarouselProps = {
  deals: Deal[];
  /** Builds internal detail URLs for each card. */
  getHref: (deal: Deal) => string;
  /** PostHog `home_section` when rendered on the home page. */
  homeSection?: string;
  /** Accessible label for the scroll region. */
  ariaLabel: string;
  className?: string;
};

export function DealCarousel({
  deals,
  getHref,
  homeSection,
  ariaLabel,
  className,
}: DealCarouselProps) {
  if (deals.length === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="list"
      aria-label={ariaLabel}
    >
      {deals.map((deal) => (
        <div
          key={deal.id}
          role="listitem"
          className="w-[min(85vw,20rem)] shrink-0 snap-start sm:w-[20rem]"
        >
          <DealCard
            deal={deal}
            href={getHref(deal)}
            homeSection={homeSection}
          />
        </div>
      ))}
    </div>
  );
}
