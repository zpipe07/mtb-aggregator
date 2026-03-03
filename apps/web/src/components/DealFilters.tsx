import type { Store } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";

export type SortOption = "newest" | "discount" | "price_asc" | "price_desc" | "relevance";

const BASE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Highest discount" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const SPEC_KEY_OPTIONS = [
  { value: "", label: "Any spec" },
  { value: "wheel_size", label: "Wheel size" },
  { value: "travel", label: "Travel" },
  { value: "material", label: "Material" },
  { value: "tooth_count", label: "Tooth count" },
  { value: "brake_type", label: "Brake type" },
  { value: "speeds", label: "Drivetrain speeds" },
  { value: "weight", label: "Weight" },
  { value: "offset", label: "Offset" },
  { value: "axle", label: "Axle" },
  { value: "hub_spacing", label: "Hub spacing" },
  { value: "steerer", label: "Steerer" },
  { value: "damper", label: "Damper" },
  { value: "spring", label: "Spring" },
];

function getSortOptions(hasSearchQuery: boolean): { value: SortOption; label: string }[] {
  if (!hasSearchQuery) return BASE_SORT_OPTIONS;
  return [
    { value: "relevance", label: "Relevance" },
    ...BASE_SORT_OPTIONS,
  ];
}

/** Group canonical categories by top-level (Bikes, Components, Gear, Accessories) for optgroup. */
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

type DealFiltersProps = {
  stores: Store[];
  brands: string[];
  categories: string[];
  canonicalCategories: string[];
  storeFilter: string;
  brandFilter: string;
  categoryFilter: string;
  canonicalCategoryFilter: string;
  minDiscount: string;
  specKey: string;
  specValue: string;
  sort: SortOption;
  searchQuery?: string;
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onCanonicalCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecKeyChange: (value: string) => void;
  onSpecValueChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
  activeFilterCount: number;
  onClearAll: () => void;
};

export function DealFilters({
  stores,
  brands,
  categories,
  canonicalCategories,
  storeFilter,
  brandFilter,
  categoryFilter,
  canonicalCategoryFilter,
  minDiscount,
  specKey,
  specValue,
  sort,
  searchQuery = "",
  onStoreChange,
  onBrandChange,
  onCategoryChange,
  onCanonicalCategoryChange,
  onMinDiscountChange,
  onSpecKeyChange,
  onSpecValueChange,
  onSortChange,
  activeFilterCount,
  onClearAll,
}: DealFiltersProps) {
  const sortOptions = getSortOptions(searchQuery.trim() !== "");
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
    <div className="space-y-6 mb-6">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-stone-600">{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active</span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-stone-700 underline hover:text-stone-900 font-medium"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
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
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
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
        <FilterSelect
          label="Sort by"
          value={sort}
          onChange={onSortChange}
          options={sortOptions}
        />
      </div>

      <div className="flex flex-wrap gap-6 border-t border-stone-200 pt-4">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Spec</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={specKey}
              onChange={(e) => onSpecKeyChange(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 text-sm"
            >
              {SPEC_KEY_OPTIONS.map((opt) => (
                <option key={opt.value || "any"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={specValue}
              onChange={(e) => onSpecValueChange(e.target.value)}
              placeholder={specKey ? "e.g. 29, Steel, 170mm" : "Select a spec first"}
              disabled={!specKey}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 text-sm w-40"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
