import { useId } from "react";
import { track } from "@vercel/analytics";
import type { SpecFacet, Store } from "../api";
import type { SortOption } from "../lib/filterParams";
import { sanitizeForHtmlId } from "../lib/htmlId";
import { buildMinDiscountSelectOptions } from "../lib/minDiscountFilterOptions";
import { FilterSelect } from "./FilterSelect";
import { CategoryDrillDown } from "./CategoryDrillDown";
import { Button } from "./ui/button";
import { CheckboxGroup } from "./ui/checkbox-group";

export type { SortOption };

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Highest discount" },
  { value: "value", label: "Best value (savings)" },
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

function mergeSelectedFacetValues<T extends { value: string; count: number }>(
  values: T[],
  selected: string[] | undefined,
): T[] {
  if (!selected?.length) return values;
  const seen = new Set(values.map((v) => v.value));
  const prefix: T[] = [];
  for (const s of selected) {
    if (!seen.has(s)) {
      prefix.push({ value: s, count: 0 } as T);
      seen.add(s);
    }
  }
  return prefix.length ? [...prefix, ...values] : values;
}

type DealFiltersProps = {
  stores: Store[];
  brands: string[];
  canonicalCategories: string[];
  storeFilter: string;
  brandFilters: string[];
  canonicalCategoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string[]>;
  specFacets: SpecFacet[];
  sort: SortOption;
  searchQuery?: string;
  onStoreChange: (value: string) => void;
  onToggleBrand: (value: string) => void;
  onCanonicalCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onToggleSpecFilter: (key: string, value: string) => void;
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
  brandFilters,
  canonicalCategoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  sort,
  searchQuery = "",
  onStoreChange,
  onToggleBrand,
  onCanonicalCategoryChange,
  onMinDiscountChange,
  onToggleSpecFilter,
  onClearSpecFilter,
  onSortChange,
  activeFilterCount,
  onClearAll,
}: DealFiltersProps) {
  const specFacetIdPrefix = useId();
  const sortOptions = getSortOptions(searchQuery.trim() !== "");

  const handleStoreChange = (value: string) => {
    track("filter_applied", { type: "store", value });
    onStoreChange(value);
  };
  const handleToggleBrand = (value: string) => {
    track("filter_applied", { type: "brand", value });
    onToggleBrand(value);
  };
  const handleCanonicalCategoryChange = (value: string) => {
    track("filter_applied", { type: "category", value });
    onCanonicalCategoryChange(value);
  };
  const handleMinDiscountChange = (value: string) => {
    track("filter_applied", { type: "min_discount", value });
    onMinDiscountChange(value);
  };
  const handleToggleSpec = (key: string, value: string) => {
    track("filter_applied", { type: "spec", key, value });
    onToggleSpecFilter(key, value);
  };
  const handleSortChange = (value: SortOption) => {
    track("filter_applied", { type: "sort", value });
    onSortChange(value);
  };

  const storeOptions = [
    { value: "", label: "All stores" },
    ...(stores ?? []).map((s) => ({ value: s.name, label: `${s.name} (${s.deal_count})` })),
  ];
  const brandCheckboxOptions = mergeSelectedFacetValues(
    (brands ?? []).map((b) => ({ value: b, count: 0 })),
    brandFilters,
  );
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
        <div className="min-w-[200px] max-w-sm flex-1">
          <CheckboxGroup
            name="deal-filters-brand"
            legend="Brand"
            selected={brandFilters}
            options={brandCheckboxOptions}
            onToggle={handleToggleBrand}
          />
        </div>
        {hasCanonicalOptions && (
          <CategoryDrillDown
            label="Category"
            value={canonicalCategoryFilter}
            onChange={handleCanonicalCategoryChange}
            options={canonicalCategories ?? []}
            className="min-w-[200px]"
          />
        )}
        <FilterSelect
          label="Min discount"
          value={minDiscount}
          onChange={handleMinDiscountChange}
          options={buildMinDiscountSelectOptions(minDiscount)}
        />
        <FilterSelect
          label="Sort by"
          value={sort}
          onChange={handleSortChange}
          options={sortOptions}
        />
      </div>

      {canonicalCategoryFilter && specFacets.length > 0 && (
        <div className="flex flex-wrap gap-6 border-t border-foreground/15 pt-4">
          {specFacets.map((facet) => {
            const specValueOptions = mergeSelectedFacetValues(
              facet.values,
              specFilters[facet.key],
            );
            const nSel = specFilters[facet.key]?.length ?? 0;
            return (
              <div key={facet.key} className="min-w-[12rem] max-w-sm">
                <CheckboxGroup
                  name={`${specFacetIdPrefix}-${sanitizeForHtmlId(facet.key)}`}
                  legend={facet.label}
                  selected={specFilters[facet.key] ?? []}
                  options={specValueOptions}
                  onToggle={(v) => handleToggleSpec(facet.key, v)}
                />
                {nSel > 0 && (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
