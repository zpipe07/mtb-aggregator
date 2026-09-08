"use client";

import { useEffect, useId, useState } from "react";
import { cn, focusRingWithin } from "@/lib/utils";

type PriceRangeFilterProps = {
  minPrice: string;
  maxPrice: string;
  priceRange?: { min: number; max: number };
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
};

function formatHintAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(0);
}

function PriceField({
  id,
  label,
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div
        className={cn(
          "flex w-full min-w-0 items-center gap-1 rounded-sm border-t border-b border-foreground/60 bg-card px-3 py-2",
          focusRingWithin,
        )}
      >
        <span className="font-mono text-sm text-muted-foreground" aria-hidden>
          $
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "min-h-0 min-w-0 flex-1 border-0 bg-transparent py-0.5",
            "font-mono text-sm text-foreground outline-none",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>
    </div>
  );
}

export function PriceRangeFilter({
  minPrice,
  maxPrice,
  priceRange,
  onMinPriceChange,
  onMaxPriceChange,
}: PriceRangeFilterProps) {
  const minId = useId();
  const maxId = useId();
  const [minDraft, setMinDraft] = useState(minPrice);
  const [maxDraft, setMaxDraft] = useState(maxPrice);

  useEffect(() => {
    setMinDraft(minPrice);
  }, [minPrice]);

  useEffect(() => {
    setMaxDraft(maxPrice);
  }, [maxPrice]);

  const commitMin = () => {
    const trimmed = minDraft.trim();
    if (trimmed !== minPrice) onMinPriceChange(trimmed);
  };

  const commitMax = () => {
    const trimmed = maxDraft.trim();
    if (trimmed !== maxPrice) onMaxPriceChange(trimmed);
  };

  const hint =
    priceRange && priceRange.max > 0
      ? `$${formatHintAmount(priceRange.min)} – $${formatHintAmount(priceRange.max)}`
      : null;

  return (
    <div className="space-y-1">
      <p className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
        {"// price"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <PriceField
          id={minId}
          label="Minimum price"
          value={minDraft}
          placeholder="Min"
          onChange={setMinDraft}
          onCommit={commitMin}
        />
        <PriceField
          id={maxId}
          label="Maximum price"
          value={maxDraft}
          placeholder="Max"
          onChange={setMaxDraft}
          onCommit={commitMax}
        />
      </div>
      {hint ? (
        <p className="pt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
