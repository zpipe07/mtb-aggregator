"use client";

import { ExternalLink } from "lucide-react";
import posthog from "posthog-js";
import type { Giveaway } from "@/api";
import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";
import {
  deriveGiveawayStatus,
  formatGiveawayDate,
  formatTicketPrice,
} from "@/lib/giveawayStatus";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

export type GiveawayCardSurface = "home" | "giveaways";

type GiveawayCardProps = {
  giveaway: Giveaway;
  surface?: GiveawayCardSurface;
  compact?: boolean;
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

export function GiveawayCard({
  giveaway,
  surface = "giveaways",
  compact = false,
}: GiveawayCardProps) {
  const status = deriveGiveawayStatus(giveaway);
  const kindLabel = giveaway.kind === "raffle" ? "Raffle" : "Giveaway";
  const ticket = formatTicketPrice(
    giveaway.ticket_price,
    giveaway.ticket_currency ?? "USD",
  );
  const endsLabel = formatGiveawayDate(giveaway.ends_at);
  const opensLabel = formatGiveawayDate(giveaway.starts_at);

  const statusCopy =
    status === "ended"
      ? endsLabel
        ? `Ended ${endsLabel}`
        : "Ended"
      : status === "upcoming"
        ? opensLabel
          ? `Opens ${opensLabel}`
          : "Opens soon"
        : endsLabel
          ? `Ends ${endsLabel}`
          : null;

  const ctaLabel =
    giveaway.kind === "raffle"
      ? `Get tickets on ${giveaway.host_name}`
      : `Enter on ${giveaway.host_name}`;

  const showPrimaryCta = status === "open";

  return (
    <article
      id={giveaway.slug}
      className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-foreground/20 bg-card"
    >
      <CardCropMarks />
      <div
        className={cn(
          "relative overflow-hidden border-b border-foreground/15 bg-muted",
          compact ? "aspect-[16/9]" : "aspect-[4/3]",
        )}
      >
        {giveaway.image_url ? (
          <img
            src={giveaway.image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <span className={cn(monoMicro, "text-muted-foreground")}>
              {"// "}
              {kindLabel}
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="bg-foreground px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {kindLabel}
          </span>
          {status !== "open" ? (
            <span className="bg-card px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground ring-1 ring-foreground/25">
              {status === "ended" ? "Ended" : "Upcoming"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col space-y-3 p-4">
        <div className="space-y-1.5">
          <div className={cn(monoMicro, "text-muted-foreground")}>
            {"// "}
            {giveaway.host_name}
          </div>
          <h2 className="text-base font-medium leading-snug tracking-tight text-foreground">
            {giveaway.title}
          </h2>
          {!compact ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {giveaway.summary}
            </p>
          ) : null}
        </div>

        <p className={cn(monoMicro, "text-muted-foreground")}>
          Prize: {giveaway.prize_name}
        </p>

        {giveaway.kind === "raffle" && ticket ? (
          <p className="font-mono text-sm tabular-nums text-foreground">
            {ticket} / ticket
          </p>
        ) : giveaway.kind === "raffle" ? (
          <p className={cn(monoMicro, "text-muted-foreground")}>
            Ticketed entry on the host site
          </p>
        ) : null}

        {giveaway.beneficiary ? (
          <p className="text-sm text-muted-foreground">
            Proceeds: {giveaway.beneficiary}
          </p>
        ) : null}

        {!compact && giveaway.eligibility ? (
          <p className="text-sm text-muted-foreground">{giveaway.eligibility}</p>
        ) : null}

        {statusCopy ? (
          <p className={cn(monoMicro, "text-muted-foreground")}>{statusCopy}</p>
        ) : null}

        <div className="mt-auto space-y-2 pt-1">
          {showPrimaryCta ? (
            <Button asChild size="lg" className="w-full">
              <a
                href={giveaway.entry_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => {
                  posthog.capture("giveaway_outbound_click", {
                    giveaway_id: giveaway.id,
                    kind: giveaway.kind,
                    status,
                    host_name: giveaway.host_name,
                    surface,
                  });
                }}
              >
                <span className="relative z-[1] inline-flex items-center gap-1.5">
                  {ctaLabel}
                  <ExternalLink
                    aria-hidden
                    className="size-3.5 shrink-0"
                    strokeWidth={2.25}
                  />
                  <span className="sr-only"> (opens in new tab)</span>
                </span>
              </a>
            </Button>
          ) : null}
          <a
            href={giveaway.official_rules_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn(
              "inline-block font-mono text-xs font-semibold tracking-wide text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
              focusRing,
            )}
          >
            Official rules
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
