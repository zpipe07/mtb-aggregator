"use client";

import posthog from "posthog-js";
import type { SortOption } from "../hooks/useFilterParams";
import { SearchBar, SEARCH_FRAME_MIN_H } from "./SearchBar";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
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
              "shrink-0 gap-2 px-4 lg:hidden",
              "inline-flex items-center justify-center",
              activeFilterCount > 0 &&
                "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
            )}
          >
            <svg
              className="size-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span className="font-mono text-[9px] font-bold tracking-[0.08em] normal-case">
              Filters
              {activeFilterCount > 0 && (
                <span className="text-primary"> · {activeFilterCount}</span>
              )}
            </span>
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
