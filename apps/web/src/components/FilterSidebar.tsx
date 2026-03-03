import type { SpecFacet, Store } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";

/** Group canonical categories by top-level for optgroup. */
function groupCanonicalCategories(list: string[]): { group: string; options: { value: string; label: string }[] }[] {
  const byGroup = new Map<string, string[]>();
  for (const path of list) {
    const top = path.split(" > ")[0]?.trim() || "Other";
    if (!byGroup.has(top)) byGroup.set(top, []);
    byGroup.get(top)!.push(path);
  }
  const order = ["Bikes", "Components", "Gear", "Accessories", "Other"];
  return order.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    options: (byGroup.get(group) ?? []).map((p) => ({ value: p, label: p })),
  }));
}

export type FilterSidebarProps = {
  stores: Store[];
  brands: string[];
  categories: string[];
  canonicalCategories: string[];
  storeFilter: string;
  brandFilter: string;
  categoryFilter: string;
  canonicalCategoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  specFacets: SpecFacet[];
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onCanonicalCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brands,
  categories,
  canonicalCategories,
  storeFilter,
  brandFilter,
  categoryFilter,
  canonicalCategoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  onStoreChange,
  onBrandChange,
  onCategoryChange,
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
  const categoryOptions = [
    { value: "", label: "All categories" },
    ...(categories ?? []).map((c) => ({ value: c, label: c })),
  ];
  const groupedCanonical = groupCanonicalCategories(canonicalCategories ?? []);
  const hasCanonicalOptions = groupedCanonical.some((g) => g.options.length > 0);

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
      <FilterSelect
        label="Category (raw)"
        value={categoryFilter}
        onChange={onCategoryChange}
        options={categoryOptions}
      />
      {hasCanonicalOptions && (
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Category</label>
          <select
            value={canonicalCategoryFilter}
            onChange={(e) => onCanonicalCategoryChange(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
          >
            <option value="">All categories</option>
            {groupedCanonical.map(({ group, options }) => (
              <optgroup key={group} label={group}>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
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
