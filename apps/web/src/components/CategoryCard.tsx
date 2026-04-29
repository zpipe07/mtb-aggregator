"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

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
  return (
    <Link
      href={to}
      className="group block"
      onClick={() =>
        posthog.capture("category_clicked", { category: label, href: to })
      }
    >
      <Card
        className={cn(
          "relative overflow-hidden rounded-[var(--radius)] border border-foreground p-0 shadow-sm transition-all duration-200 cursor-pointer",
          "hover:-translate-y-0.5 hover:border-foreground hover:shadow-md",
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {label.charAt(0)}
            </div>
          )}
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
      </Card>
    </Link>
  );
}
