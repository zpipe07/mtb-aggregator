"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Card } from "./ui/card";
import { cn, focusRing } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

function CardCropMarks() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2 top-2 z-20 size-3 border-l border-t border-foreground/70"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 right-2 z-20 size-3 border-b border-r border-foreground/70"
      />
    </>
  );
}

type CategoryCardProps = {
  label: string;
  to: string;
  description?: string;
  imageSrc?: string;
  /** Rollup deal count when known (category tree). */
  dealCount?: number;
};

export function CategoryCard({
  label,
  to,
  description,
  imageSrc,
  dealCount,
}: CategoryCardProps) {
  const hasImage = Boolean(imageSrc);

  const metaLine =
    description ??
    (dealCount != null ? `${dealCount.toLocaleString()} deal${dealCount === 1 ? "" : "s"}` : null);

  return (
    <Link
      href={to}
      className={cn("group block rounded-[var(--radius)]", focusRing)}
      onClick={() =>
        posthog.capture("category_clicked", { category: label, href: to })
      }
    >
      <Card
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-[var(--radius)] border border-foreground shadow-sm transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-foreground hover:shadow-md",
          hasImage ? "p-0" : "bg-card p-0",
        )}
      >
        {hasImage ? (
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-foreground px-3 py-2.5">
              <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-primary">
                {"// category"}
              </span>
              <span className="text-sm font-semibold leading-snug text-background">
                {label.toUpperCase()}
                {dealCount != null && dealCount > 0 ? (
                  <>
                    {" "}
                    · {dealCount.toLocaleString()}{" "}
                    <span className="text-primary">→</span>
                  </>
                ) : (
                  <span className="text-primary"> →</span>
                )}
              </span>
              {description ? (
                <span className="text-xs text-background/80">{description}</span>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <CardCropMarks />
            <div className="relative flex min-h-[10.5rem] flex-col gap-4 p-4 sm:min-h-[11rem] sm:p-5">
              <div className="absolute inset-0 -z-0 bg-gradient-to-br from-muted/60 to-transparent to-60%" />
              <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2">
                <span className={cn(monoMicro, "text-muted-foreground")}>
                  {"// category"}
                </span>
                <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
                  {label}
                </h3>
                {metaLine ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {metaLine}
                  </p>
                ) : null}
              </div>
              <div className="relative z-10 flex items-center justify-between border-t border-border pt-3">
                <span className={cn(monoMicro, "text-muted-foreground")}>
                  browse deals
                </span>
                <span
                  aria-hidden
                  className="font-mono text-base font-semibold text-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
            </div>
          </>
        )}
      </Card>
    </Link>
  );
}
