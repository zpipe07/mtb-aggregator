"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { captureHomeViewAllClicked } from "@/lib/homeViewAllAnalytics";
import { buttonVariants } from "./ui/button";
import { cn, focusRing } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

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

type ViewAllDealsCardProps = {
  href: string;
  /** Visible heading, e.g. "View all mountain bikes". */
  label: string;
  /** PostHog `home_section` when rendered on the home page. */
  homeSection?: string;
};

export function ViewAllDealsCard({
  href,
  label,
  homeSection,
}: ViewAllDealsCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-full w-full flex-col self-stretch pt-3 rounded-sm",
      )}
    >
      <span
        className={cn(
          "absolute right-4 top-0 z-10 rounded-t-sm border border-foreground border-b-0 bg-primary px-2 py-0.5",
          monoMicro,
          "text-foreground",
        )}
      >
        {"// "}
        MORE
      </span>

      <Link
        href={href}
        className={cn(
          "group/card relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-sm border border-foreground bg-card transition-transform duration-200",
          "hover:-translate-y-0.5",
          focusRing,
        )}
        onClick={() =>
          captureHomeViewAllClicked({
            navSource: "rail_end_card",
            homeSection,
            href,
          })
        }
      >
        <CardCropMarks />

        <div className="relative aspect-[16/9] overflow-hidden border-b border-foreground bg-muted sm:aspect-square">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <span
              aria-hidden
              className="flex size-14 items-center justify-center border border-foreground bg-primary text-foreground shadow-[2px_2px_0_var(--foreground)]"
            >
              <ArrowRight className="size-7" strokeWidth={2.25} />
            </span>
            <span className={cn(monoMicro, "text-muted-foreground")}>
              {"// keep going"}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 pb-0">
          <h2 className="line-clamp-2 text-base font-medium leading-snug tracking-tight text-foreground sm:text-xl sm:font-semibold">
            {label}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            See the rest of today&apos;s sales on the deals page.
          </p>
        </div>

        <div className="mt-auto px-4 pb-4 pt-3">
          <span
            aria-hidden
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full pointer-events-none",
              "group-hover/card:text-foreground group-hover/card:before:w-full",
            )}
          >
            <span className="relative z-[1] inline-flex items-center gap-1.5">
              Browse deals
              <ArrowRight data-icon="inline-end" />
            </span>
          </span>
        </div>
      </Link>
    </div>
  );
}
