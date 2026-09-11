"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { captureHomeViewAllClicked } from "@/lib/homeViewAllAnalytics";
import { cn, focusRing } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

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
    <Link
      href={href}
      className={cn(
        "group/card relative flex h-full min-h-full w-full flex-col justify-between self-stretch overflow-hidden rounded-sm border border-dashed border-foreground bg-card p-5",
        "transition-[background-color,border-color,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-solid hover:bg-primary/30",
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
      <span
        aria-hidden
        className="pointer-events-none absolute left-2 top-2 size-3 border-l border-t border-foreground"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 right-2 size-3 border-b border-r border-foreground"
      />

      <span className={cn(monoMicro, "text-muted-foreground")}>
        {"// keep going"}
      </span>

      <div className="flex flex-1 flex-col items-start justify-center gap-5 py-6">
        <span
          aria-hidden
          className="flex size-14 items-center justify-center border border-foreground bg-primary text-foreground transition-transform duration-200 group-hover/card:translate-x-0.5"
        >
          <ArrowRight className="size-7" strokeWidth={2.25} />
        </span>
        <h2 className="max-w-[12ch] text-2xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground">
          {label}
        </h2>
      </div>

      <span
        className={cn(
          monoMicro,
          "inline-flex items-center gap-2 text-foreground",
        )}
      >
        Continue
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-hover/card:translate-x-0.5"
          strokeWidth={2.25}
        />
      </span>
    </Link>
  );
}
