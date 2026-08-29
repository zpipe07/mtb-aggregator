"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { sanitizeForHtmlId } from "@/lib/htmlId";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CheckboxGroupOption = {
  value: string;
  /** Optional count shown as (n) after the value, e.g. facet hit counts */
  count?: number;
};

export type CheckboxGroupProps = {
  /** Prefix for stable input ids (with option value) */
  name: string;
  legend: string;
  selected: string[];
  options: CheckboxGroupOption[];
  onToggle: (value: string) => void;
  className?: string;
};

type ScrollFadeState = {
  canScrollUp: boolean;
  canScrollDown: boolean;
};

function useScrollFade(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  deps: unknown[],
) {
  const [fade, setFade] = useState<ScrollFadeState>({
    canScrollUp: false,
    canScrollDown: false,
  });

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Hidden (e.g. closed drawer) — don't treat 0-height as overflow.
    if (el.clientHeight === 0) {
      setFade({ canScrollUp: false, canScrollDown: false });
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    // Compare against max-height (max-h-64), not clientHeight. Short lists can
    // report 1–4px of phantom overflow from subpixels/scrollbars.
    const maxHeightPx = parseFloat(getComputedStyle(el).maxHeight);
    const limit = Number.isFinite(maxHeightPx) ? maxHeightPx : clientHeight;
    const overflows = scrollHeight > limit + 1;

    setFade({
      canScrollUp: overflows && scrollTop > 1,
      canScrollDown:
        overflows && scrollTop + clientHeight < scrollHeight - 1,
    });
  }, [scrollRef]);

  useLayoutEffect(() => {
    updateFade();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", updateFade);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure when option list changes
  }, [updateFade, ...deps]);

  return fade;
}

const overflowFade =
  "pointer-events-none absolute inset-x-0 z-10 h-11 from-[var(--checkbox-overflow-fade,var(--card))] from-15% via-[color-mix(in_oklab,var(--checkbox-overflow-fade,var(--card))_50%,transparent)] to-transparent";

/** Multi-select checkbox list. Long lists scroll with edge fades when overflow exists. */
export function CheckboxGroup({
  name,
  legend,
  selected,
  options,
  onToggle,
  className,
}: CheckboxGroupProps) {
  const selectedSet = new Set(selected);
  const safeName = sanitizeForHtmlId(name);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollUp, canScrollDown } = useScrollFade(scrollRef, [options.length]);

  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="mb-1.5 block font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {"// "}
        {legend}
      </legend>
      <div className="relative">
        {canScrollUp ? (
          <div
            className={cn(overflowFade, "top-0 bg-gradient-to-b")}
            aria-hidden
          />
        ) : null}
        <div
          ref={scrollRef}
          className={cn(
            "max-h-64 space-y-1 pr-1 -mr-1",
            canScrollUp || canScrollDown
              ? "overflow-y-auto"
              : "overflow-y-visible",
          )}
          role="group"
          aria-label={legend}
        >
          {options.map((opt) => {
            const id = `${safeName}-${sanitizeForHtmlId(opt.value)}`;
            const checked = selectedSet.has(opt.value);
            const showCount = typeof opt.count === "number";
            return (
              <div
                key={`${name}-${opt.value}`}
                className="flex items-start gap-2 rounded-md py-0.5 pr-1 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  id={id}
                  name={name}
                  checked={checked}
                  onCheckedChange={() => onToggle(opt.value)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={id}
                  className="min-w-0 flex-1 cursor-pointer font-normal leading-snug text-foreground"
                >
                  {opt.value}
                  {showCount ? (
                    <>
                      {" "}
                      <span className="tabular-nums text-muted-foreground">
                        ({opt.count})
                      </span>
                    </>
                  ) : null}
                </Label>
              </div>
            );
          })}
        </div>
        {canScrollDown ? (
          <div
            className={cn(overflowFade, "bottom-0 bg-gradient-to-t")}
            aria-hidden
          />
        ) : null}
      </div>
    </fieldset>
  );
}
