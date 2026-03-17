import type { SpecFacet, Store } from "../api";
import type { CategoryTreeNode } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";
import { CategoryDrillDown } from "./CategoryDrillDown";

/** Flatten tree to { slug, path } for drill-down options. Path = "Parent > Child" for display. */
function flattenCategoryTree(
  tree: CategoryTreeNode[],
  prefix = "",
): { slug: string; path: string }[] {
  const result: { slug: string; path: string }[] = [];
  for (const node of tree) {
    const path = prefix ? `${prefix} > ${node.name}` : node.name;
    result.push({ slug: node.slug, path });
    if (node.children?.length) {
      result.push(...flattenCategoryTree(node.children, path));
    }
  }
  return result;
}

export type FilterSidebarProps = {
  stores: Store[];
  brands: string[];
  /** Structured category tree from API. Preferred over canonicalCategories. */
  categoryTree?: CategoryTreeNode[];
  /** Legacy: flat "Parent > Child" paths when tree not available */
  canonicalCategories?: string[];
  storeFilter: string;
  brandFilter: string;
  /** Category filter: slug (e.g. bikes-mountain) when using tree, or path when legacy */
  categoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  specFacets: SpecFacet[];
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brands,
  categoryTree,
  canonicalCategories = [],
  storeFilter,
  brandFilter,
  categoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  onStoreChange,
  onBrandChange,
  onCategoryChange,
  onMinDiscountChange,
  onSpecFilterChange,
  onClearSpecFilter,
}: FilterSidebarProps) {
  const storeOptions = [
    { value: "", label: "All stores" },
    ...(stores ?? []).map((s) => ({
      value: s.name,
      label: `${s.name} (${s.deal_count})`,
    })),
  ];
  const brandOptions = [
    { value: "", label: "All brands" },
    ...(brands ?? []).map((b) => ({ value: b, label: b })),
  ];

  const flat = categoryTree ? flattenCategoryTree(categoryTree) : [];
  const slugToPath = Object.fromEntries(flat.map((f) => [f.slug, f.path]));
  const pathToSlug = Object.fromEntries(flat.map((f) => [f.path, f.slug]));
  const categoryOptions = categoryTree ? flat.map((f) => f.path) : canonicalCategories;
  const hasCategoryOptions = categoryOptions.length > 0;
  const drillDownValue = categoryTree ? (slugToPath[categoryFilter] ?? "") : categoryFilter;

  return (
    <div className="space-y-6">
      {hasCategoryOptions && (
        <CategoryDrillDown
          label="Category"
          value={drillDownValue}
          onChange={(v) => onCategoryChange(categoryTree ? (pathToSlug[v] ?? "") : v)}
          options={categoryOptions}
        />
      )}

      <FilterSelect
        label="Brand"
        value={brandFilter}
        onChange={onBrandChange}
        options={brandOptions}
      />

      <FilterSelect
        label="Store"
        value={storeFilter}
        onChange={onStoreChange}
        options={storeOptions}
      />

      <FilterInput
        label="Min discount %"
        value={minDiscount}
        onChange={onMinDiscountChange}
        placeholder="e.g. 20"
        min={0}
        max={100}
      />

      {categoryFilter && specFacets.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          {specFacets.map((facet) => (
            <div key={facet.key}>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {facet.label}
              </label>
              <select
                value={specFilters[facet.key] ?? ""}
                onChange={(e) => onSpecFilterChange(facet.key, e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 bg-background text-foreground text-sm"
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
                  className="mt-1 text-sm text-muted-foreground underline hover:text-foreground"
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
