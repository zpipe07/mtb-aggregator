"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/utils";

const SCROLL_THRESHOLD_PX = 400;

export function ScrollToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SCROLL_THRESHOLD_PX);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    posthog.capture("scroll_to_top_clicked", { pathname });
  }, [pathname]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-6 right-4 z-30 border-border/80 bg-card/90 shadow-sm backdrop-blur-sm transition-[opacity,transform] duration-200 sm:right-6",
        focusRing,
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp aria-hidden />
    </Button>
  );
}
