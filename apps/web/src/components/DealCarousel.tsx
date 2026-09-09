"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import posthog from "posthog-js";
import type { Deal } from "../api";
import { DealCard } from "./DealCard";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { railOverflowState, railScrollStep } from "@/lib/railScroll";

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
  const listId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(deals.length > 1);

  const updateOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = railOverflowState(el.scrollLeft, el.clientWidth, el.scrollWidth);
    setCanScrollLeft(next.canScrollLeft);
    setCanScrollRight(next.canScrollRight);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    updateOverflow();
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const ro = new ResizeObserver(updateOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateOverflow);
      ro.disconnect();
    };
  }, [deals.length, updateOverflow]);

  const scrollByPage = (direction: "prev" | "next") => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstItem = el.querySelector<HTMLElement>("[data-rail-item]");
    const step = railScrollStep(el.clientWidth, firstItem?.offsetWidth);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollBy({
      left: direction === "next" ? step : -step,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    posthog.capture("home_rail_scrolled", {
      direction,
      nav_source: "arrow",
      ...(homeSection ? { home_section: homeSection } : {}),
    });
  };

  if (deals.length === 0) return null;

  return (
    <div className={cn("relative isolate", className)}>
      <div
        id={listId}
        ref={scrollerRef}
        className={cn(
          "relative z-0 flex w-full min-w-0 items-stretch gap-4 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
        role="list"
        aria-label={ariaLabel}
      >
        {deals.map((deal) => (
          <div
            key={deal.id}
            role="listitem"
            data-rail-item
            className="flex w-[min(78vw,20rem)] shrink-0 snap-start self-stretch sm:w-[20rem]"
          >
            <DealCard
              deal={deal}
              href={getHref(deal)}
              homeSection={homeSection}
            />
          </div>
        ))}
      </div>

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 sm:w-16",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 sm:w-16",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      />

      {canScrollLeft ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-controls={listId}
          aria-label={`Scroll ${ariaLabel} backward`}
          onClick={() => scrollByPage("prev")}
          className="pointer-events-auto absolute top-1/2 left-1 z-30 -translate-y-1/2 border-foreground bg-card shadow-sm sm:left-2"
        >
          <ChevronLeft />
        </Button>
      ) : null}
      {canScrollRight ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-controls={listId}
          aria-label={`Scroll ${ariaLabel} forward`}
          onClick={() => scrollByPage("next")}
          className="pointer-events-auto absolute top-1/2 right-1 z-30 -translate-y-1/2 border-foreground bg-card shadow-sm sm:right-2"
        >
          <ChevronRight />
        </Button>
      ) : null}
    </div>
  );
}
