import type { SpecFacet, Store } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";
import { CategoryDrillDown } from "./CategoryDrillDown";

export type FilterSidebarProps = {
  stores: Store[];
  brands: string[];
  canonicalCategories: string[];
  storeFilter: string;
  brandFilter: string;
  canonicalCategoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  specFacets: SpecFacet[];
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCanonicalCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brands,
  canonicalCategories,
  storeFilter,
  brandFilter,
  canonicalCategoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  onStoreChange,
  onBrandChange,
  onCanonicalCategoryChange,
  onMinDiscountChange,
  onSpecFilterChange,
  onClearSpecFilter,
}: FilterSidebarProps) {
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
    <div className="space-y-6">
      <FilterSelect
        label="Store"
        value={storeFilter}
        onChange={onStoreChange}
        options={storeOptions}
      />
      <FilterSelect
        label="Brand"
        value={brandFilter}
        onChange={onBrandChange}
        options={brandOptions}
      />
      {hasCanonicalOptions && (
        <CategoryDrillDown
          label="Category"
          value={canonicalCategoryFilter}
          onChange={onCanonicalCategoryChange}
          options={canonicalCategories ?? []}
        />
      )}
      <FilterInput
        label="Min discount %"
        value={minDiscount}
        onChange={onMinDiscountChange}
        placeholder="e.g. 20"
        min={0}
        max={100}
      />

      {canonicalCategoryFilter && specFacets.length > 0 && (
        <div className="space-y-4 border-t border-stone-200 pt-4">
          {specFacets.map((facet) => (
            <div key={facet.key}>
              <label className="block text-sm font-medium text-stone-600 mb-1.5">
                {facet.label}
              </label>
              <select
                value={specFilters[facet.key] ?? ""}
                onChange={(e) => onSpecFilterChange(facet.key, e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 text-sm"
              >
                <option value="">Any {facet.label.toLowerCase()}</option>
                {facet.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.value} ({v.count})
                  </option>
                ))}
              </select>
              {specFilters[facet.key] && (
                <button
                  type="button"
                  onClick={() => onClearSpecFilter(facet.key)}
                  className="mt-1 text-sm text-stone-700 underline hover:text-stone-900"
                >
                  Clear
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
