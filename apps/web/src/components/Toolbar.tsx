"use client";

import posthog from "posthog-js";
import { ListFilter } from "lucide-react";
import type { SortOption } from "../hooks/useFilterParams";
import { SearchBar, SEARCH_FRAME_MIN_H } from "./SearchBar";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "value", label: "Best value" },
  { value: "discount", label: "Highest discount" },
  { value: "price_drop", label: "Recent price drops" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function getSortOptions(hasSearchQuery: boolean): { value: SortOption; label: string }[] {
  if (!hasSearchQuery) return BASE_SORT_OPTIONS;
  return [
    { value: "relevance", label: "Relevance" },
    ...BASE_SORT_OPTIONS,
  ];
}

type ToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  searchQuery: string;
  onFilterClick?: () => void;
  activeFilterCount?: number;
};

export function Toolbar({
  searchValue,
  onSearchChange,
  sort,
  onSortChange,
  searchQuery,
  onFilterClick,
  activeFilterCount = 0,
}: ToolbarProps) {
  const sortOptions = getSortOptions(searchQuery.trim() !== "");

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <SearchBar value={searchValue} onChange={onSearchChange} />
        </div>
        {onFilterClick != null ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={onFilterClick}
            className={cn(
              SEARCH_FRAME_MIN_H,
              "shrink-0 gap-2 px-4 text-sm tracking-[0.12em] lg:hidden",
              "inline-flex items-center justify-center",
              activeFilterCount > 0 &&
                "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
            )}
          >
            <ListFilter className="size-4" aria-hidden />
            Filters
            {activeFilterCount > 0 ? (
              <span className="tabular-nums text-primary">{activeFilterCount}</span>
            ) : null}
          </Button>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <label
          htmlFor="sort-select"
          className={cn(monoMicro, "text-foreground")}
        >
          {"// sort"}
        </label>
        <Select
          id="sort-select"
          value={sort}
          onChange={(e) => {
            const value = e.target.value as SortOption;
            posthog.capture("sort_changed", { sort: value });
            onSortChange(value);
          }}
          wrapperClassName={cn(
            SEARCH_FRAME_MIN_H,
            "w-full min-w-[10rem] shrink-0 sm:w-auto",
          )}
          className="normal-case"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
