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

  const showControls = canScrollLeft || canScrollRight;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        id={listId}
        ref={scrollerRef}
        className={cn(
          "flex w-full min-w-0 items-stretch gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory",
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

      {showControls ? (
        <div
          role="group"
          aria-label={`Scroll ${ariaLabel}`}
          className="flex justify-end gap-2"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-controls={listId}
            aria-label={`Scroll ${ariaLabel} backward`}
            disabled={!canScrollLeft}
            onClick={() => scrollByPage("prev")}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-controls={listId}
            aria-label={`Scroll ${ariaLabel} forward`}
            disabled={!canScrollRight}
            onClick={() => scrollByPage("next")}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
