"use client";

import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import posthog from "posthog-js";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { railOverflowState, railScrollStep } from "@/lib/railScroll";

const railItemClassName =
  "flex w-[min(20rem,calc(100%-1.75rem))] shrink-0 snap-start self-stretch";

type DealCarouselProps = {
  children: React.ReactNode;
  /** PostHog `home_section` when rendered on the home page. */
  homeSection?: string;
  /** Accessible label for the scroll region. */
  ariaLabel: string;
  className?: string;
};

const railArrowClassName = "disabled:opacity-25";

export function DealCarousel({
  children,
  homeSection,
  ariaLabel,
  className,
}: DealCarouselProps) {
  const listId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const itemCount = items.length;
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(itemCount > 1);

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
  }, [itemCount, updateOverflow]);

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

  if (itemCount === 0) return null;

  const showControls = canScrollLeft || canScrollRight;

  return (
    <div
      className={cn(
        "relative isolate min-w-0",
        // Persistent gutters: arrows sit beside the cards, not over them.
        showControls && "px-7 sm:px-11",
        className,
      )}
    >
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
        {items.map((child, index) => (
          <div
            key={isValidElement(child) && child.key != null ? String(child.key) : index}
            role="listitem"
            data-rail-item
            className={railItemClassName}
          >
            {child}
          </div>
        ))}
      </div>

      {showControls ? (
        <>
          <RailArrow
            direction="prev"
            listId={listId}
            ariaLabel={ariaLabel}
            disabled={!canScrollLeft}
            onClick={() => scrollByPage("prev")}
          />
          <RailArrow
            direction="next"
            listId={listId}
            ariaLabel={ariaLabel}
            disabled={!canScrollRight}
            onClick={() => scrollByPage("next")}
          />
        </>
      ) : null}
    </div>
  );
}

function RailArrow({
  direction,
  listId,
  ariaLabel,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  listId: string;
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <div
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2",
        direction === "prev" ? "left-0 sm:left-1" : "right-0 sm:right-1",
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-controls={listId}
        aria-label={`Scroll ${ariaLabel} ${direction === "prev" ? "backward" : "forward"}`}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "sm:min-h-9 sm:min-w-9 sm:[&_svg:not([class*='size-'])]:size-4",
          railArrowClassName,
        )}
      >
        <Icon />
      </Button>
    </div>
  );
}
