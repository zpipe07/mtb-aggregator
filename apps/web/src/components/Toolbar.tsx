import type { SortOption } from "../hooks/useFilterParams";
import { SearchBar } from "./SearchBar";

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Highest discount" },
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
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center mb-4">
      <div className="flex-1 min-w-0">
        <SearchBar value={searchValue} onChange={onSearchChange} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onFilterClick != null && (
          <button
            type="button"
            onClick={onFilterClick}
            className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg border border-input bg-background text-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        <div>
          <label htmlFor="sort-select" className="sr-only">
            Sort by
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="rounded-lg border border-input px-3 py-2 bg-background text-foreground text-sm"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
