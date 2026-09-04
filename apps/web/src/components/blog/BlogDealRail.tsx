import type { Deal } from "@/api";
import { DealCarousel } from "@/components/DealCarousel";
import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";
import Link from "next/link";

type Props = {
  title: string;
  deals: Deal[];
  seeAllHref: string;
  seeAllLabel: string;
  emptyHint?: string;
};

export function BlogDealRail({
  title,
  deals,
  seeAllHref,
  seeAllLabel,
  emptyHint = "No live listings in this category right now — check the full sale feed.",
}: Props) {
  return (
    <aside
      className="not-prose my-8 rounded-sm border border-foreground/15 bg-card px-4 py-5 sm:px-5"
      aria-label={title}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {"// live on The Dropper"}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h3>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={seeAllHref} className={cn(focusRing)}>
            {seeAllLabel}
          </Link>
        </Button>
      </div>
      {deals.length > 0 ? (
        <DealCarousel
          deals={deals}
          getHref={(deal) => `/deals/${deal.id}`}
          ariaLabel={title}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {emptyHint}{" "}
          <Link
            href={seeAllHref}
            className={cn(
              "font-medium text-foreground underline-offset-4 hover:underline",
              focusRing,
            )}
          >
            {seeAllLabel}
          </Link>
        </p>
      )}
    </aside>
  );
}
