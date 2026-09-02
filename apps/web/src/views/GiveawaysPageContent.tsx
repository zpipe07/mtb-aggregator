"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import type { Giveaway } from "@/api";
import { GiveawayCard } from "@/components/GiveawayCard";
import { Button } from "@/components/ui/button";
import { deriveGiveawayStatus, type GiveawayKind } from "@/lib/giveawayStatus";

type KindFilter = "all" | GiveawayKind;

type Props = {
  giveaways: Giveaway[];
};

export function GiveawaysPageContent({ giveaways }: Props) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  useEffect(() => {
    posthog.capture("giveaway_page_viewed");
  }, []);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return giveaways;
    return giveaways.filter((g) => g.kind === kindFilter);
  }, [giveaways, kindFilter]);

  const open = filtered.filter((g) => deriveGiveawayStatus(g) === "open");
  const upcoming = filtered.filter((g) => deriveGiveawayStatus(g) === "upcoming");
  const ended = filtered.filter((g) => deriveGiveawayStatus(g) === "ended");
  const empty = filtered.length === 0;

  function setFilter(next: KindFilter) {
    if (next === kindFilter) return;
    setKindFilter(next);
    posthog.capture("filter_applied", {
      filter_type: "giveaway_kind",
      value: next,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {"// open entries"}
        </p>
        <h1 className="text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-5xl">
          Giveaways & raffles
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Active mountain bike giveaways and raffles we&apos;ve spotted. Enter on
          the host site — The Dropper does not run these promotions, collect
          entries, or pick winners. Official rules live with the sponsor.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-2 border-b border-foreground/15 pb-4">
        {(
          [
            ["all", "All"],
            ["giveaway", "Giveaways"],
            ["raffle", "Raffles"],
          ] as const
        ).map(([value, label]) => {
          const selected = kindFilter === value;
          return (
            <Button
              key={value}
              type="button"
              variant={selected ? "default" : "outline"}
              size="sm"
              aria-pressed={selected}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      {empty ? (
        <div className="rounded-[var(--radius)] border border-dashed border-muted-foreground/45 bg-muted/25 px-6 py-12 text-center">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {"// no open entries"}
          </p>
          <p className="mb-4 font-mono text-sm text-muted-foreground">
            {kindFilter === "raffle"
              ? "No raffles right now. Check back, or browse deals."
              : kindFilter === "giveaway"
                ? "No giveaways right now. Check back, or browse deals."
                : "No open giveaways or raffles right now. Check back, or browse deals."}
          </p>
          <Button asChild variant="outline">
            <Link href="/deals">Browse deals</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-12">
          <GiveawaySection title="Open now" items={open} />
          <GiveawaySection title="Opens soon" items={upcoming} />
          <GiveawaySection title="Recently ended" items={ended} />
        </div>
      )}
    </div>
  );
}

function GiveawaySection({
  title,
  items,
}: {
  title: string;
  items: Giveaway[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <span className="mb-0.5 hidden h-px min-w-8 flex-1 bg-border sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <GiveawayCard key={g.id} giveaway={g} surface="giveaways" />
        ))}
      </div>
    </section>
  );
}
