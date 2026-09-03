import type { Giveaway } from "@/api";
import { GiveawayCard } from "@/components/GiveawayCard";
import Link from "next/link";
import { cn, focusRing } from "@/lib/utils";
import { deriveGiveawayStatus } from "@/lib/giveawayStatus";

const HOME_GIVEAWAY_LIMIT = 3;

type Props = {
  giveaways: Giveaway[];
  sectionNumber: string;
};

export function HomeGiveawaysStrip({ giveaways, sectionNumber }: Props) {
  const open = giveaways
    .filter((g) => deriveGiveawayStatus(g) === "open")
    .slice(0, HOME_GIVEAWAY_LIMIT);
  if (open.length === 0) return null;

  return (
    <section className="mt-12 lg:mt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {`// ${sectionNumber}`}
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Open entries
          </h2>
          <span className="mb-0.5 hidden h-px min-w-8 max-w-xs flex-1 bg-border sm:block" />
        </div>
        <Link
          href="/giveaways"
          className={cn(
            "rounded-sm font-mono text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          See all →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {open.map((g) => (
          <GiveawayCard
            key={g.id}
            giveaway={g}
            surface="home"
            compact
          />
        ))}
      </div>
    </section>
  );
}
