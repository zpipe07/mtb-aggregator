import { track } from "@vercel/analytics";
import type { SpecFacet, Store } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";
import { CategoryDrillDown } from "./CategoryDrillDown";
import { Select } from "./ui/select";
import { Button } from "./ui/button";

export type SortOption =
  | "newest"
  | "discount"
  | "value"
  | "price_asc"
  | "price_desc"
  | "relevance";

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Highest discount" },
  { value: "value", label: "Best value (savings)" },
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

type DealFiltersProps = {
  stores: Store[];
  brands: string[];
  canonicalCategories: string[];
  storeFilter: string;
  brandFilter: string;
  canonicalCategoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  specFacets: SpecFacet[];
  sort: SortOption;
  searchQuery?: string;
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCanonicalCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
  onSortChange: (value: SortOption) => void;
  activeFilterCount: number;
  onClearAll: () => void;
};

export function DealFilters({
  stores,
  brands,
  canonicalCategories,
  storeFilter,
  brandFilter,
  canonicalCategoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  sort,
  searchQuery = "",
  onStoreChange,
  onBrandChange,
  onCanonicalCategoryChange,
  onMinDiscountChange,
  onSpecFilterChange,
  onClearSpecFilter,
  onSortChange,
  activeFilterCount,
  onClearAll,
}: DealFiltersProps) {
  const sortOptions = getSortOptions(searchQuery.trim() !== "");

  const handleStoreChange = (value: string) => {
    track("filter_applied", { type: "store", value });
    onStoreChange(value);
  };
  const handleBrandChange = (value: string) => {
    track("filter_applied", { type: "brand", value });
    onBrandChange(value);
  };
  const handleCanonicalCategoryChange = (value: string) => {
    track("filter_applied", { type: "category", value });
    onCanonicalCategoryChange(value);
  };
  const handleMinDiscountChange = (value: string) => {
    track("filter_applied", { type: "min_discount", value });
    onMinDiscountChange(value);
  };
  const handleSpecFilterChange = (key: string, value: string) => {
    track("filter_applied", { type: "spec", key, value });
    onSpecFilterChange(key, value);
  };
  const handleSortChange = (value: SortOption) => {
    track("filter_applied", { type: "sort", value });
    onSortChange(value);
  };

  const storeOptions = [
    { value: "", label: "All stores" },
    ...(stores ?? []).map((s) => ({ value: s.name, label: `${s.name} (${s.deal_count})` })),
  ];
  const brandOptions = [
    { value: "", label: "All brands" },
    ...(brands ?? []).map((b) => ({ value: b, label: b })),
  ];
  const hasCanonicalOptions = (canonicalCategories ?? []).length > 0;

  return (
    <div className="space-y-6 mb-6">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onClearAll}
            className="h-auto p-0 text-foreground underline font-medium"
          >
            Clear all
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <FilterSelect
          label="Store"
          value={storeFilter}
          onChange={handleStoreChange}
          options={storeOptions}
        />
        <FilterSelect
          label="Brand"
          value={brandFilter}
          onChange={handleBrandChange}
          options={brandOptions}
        />
        {hasCanonicalOptions && (
          <CategoryDrillDown
            label="Category"
            value={canonicalCategoryFilter}
            onChange={handleCanonicalCategoryChange}
            options={canonicalCategories ?? []}
            className="min-w-[200px]"
          />
        )}
        <FilterInput
          label="Min discount %"
          value={minDiscount}
          onChange={handleMinDiscountChange}
          placeholder="e.g. 20"
          min={0}
          max={100}
        />
        <FilterSelect
          label="Sort by"
          value={sort}
          onChange={handleSortChange}
          options={sortOptions}
        />
      </div>

      {canonicalCategoryFilter && specFacets.length > 0 && (
        <div className="flex flex-wrap gap-6 border-t-2 border-border/50 pt-4">
          {specFacets.map((facet) => (
            <div key={facet.key}>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {facet.label}
              </label>
              <Select
                value={specFilters[facet.key] ?? ""}
                onChange={(e) => handleSpecFilterChange(facet.key, e.target.value)}
                className="w-full min-w-[12rem]"
              >
                <option value="">Any {facet.label.toLowerCase()}</option>
                {facet.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.value} ({v.count})
                  </option>
                ))}
              </Select>
              {specFilters[facet.key] && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onClearSpecFilter(facet.key)}
                  className="mt-1 h-auto p-0 text-sm text-muted-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
