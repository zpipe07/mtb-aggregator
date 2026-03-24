import { useMemo } from "react";
import type {
  BrandFacet,
  SpecFacet,
  Store,
  VariantFacet,
  VariantFacetValue,
} from "../api";
import type { CategoryTreeNode } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";
import { CategoryDrillDown } from "./CategoryDrillDown";
import { Select } from "./ui/select";
import { Button } from "./ui/button";

/** If the URL has a selected value not present in facet values (stale bookmark), show it so the user can clear or change. */
function mergeSelectedFacetValue<T extends { value: string; count: number }>(
  values: T[],
  selected: string | undefined,
): T[] {
  if (!selected) return values;
  const seen = new Set(values.map((v) => v.value));
  if (seen.has(selected)) return values;
  return [{ value: selected, count: 0 } as T, ...values];
}

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
  brandFacets: BrandFacet[];
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
  variantFilters: Record<string, string>;
  specFacets: SpecFacet[];
  variantFacets?: VariantFacet[];
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
  onVariantFilterChange: (key: string, value: string) => void;
  onClearVariantFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brandFacets,
  categoryTree,
  canonicalCategories = [],
  storeFilter,
  brandFilter,
  categoryFilter,
  minDiscount,
  specFilters,
  variantFilters,
  specFacets,
  variantFacets = [],
  onStoreChange,
  onBrandChange,
  onCategoryChange,
  onMinDiscountChange,
  onSpecFilterChange,
  onClearSpecFilter,
  onVariantFilterChange,
  onClearVariantFilter,
}: FilterSidebarProps) {
  const storeOptions = [
    { value: "", label: "All stores" },
    ...(stores ?? []).map((s) => ({
      value: s.name,
      label: `${s.name} (${s.deal_count})`,
    })),
  ];

  const brandOptions = useMemo(() => {
    const facetList = brandFacets ?? [];
    const seen = new Set(facetList.map((b) => b.value));
    const rows: BrandFacet[] =
      brandFilter && !seen.has(brandFilter)
        ? [{ value: brandFilter, count: 0 }, ...facetList]
        : facetList;
    return [
      { value: "", label: "All brands" },
      ...rows.map((b) => ({
        value: b.value,
        label: `${b.value} (${b.count})`,
      })),
    ];
  }, [brandFacets, brandFilter]);

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
          {specFacets.map((facet) => {
            const specValueOptions = mergeSelectedFacetValue(
              facet.values,
              specFilters[facet.key],
            );
            return (
            <div key={facet.key}>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {facet.label}
              </label>
              <Select
                value={specFilters[facet.key] ?? ""}
                onChange={(e) => onSpecFilterChange(facet.key, e.target.value)}
                className="w-full"
              >
                <option value="">Any {facet.label.toLowerCase()}</option>
                {specValueOptions.map((v) => (
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
            );
          })}
        </div>
      )}

      {variantFacets.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Variants
          </p>
          {variantFacets.map((facet) => {
            const variantValueOptions = mergeSelectedFacetValue(
              facet.values,
              variantFilters[facet.key],
            );
            return (
            <div key={facet.key}>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {facet.key}
              </label>
              <Select
                value={variantFilters[facet.key] ?? ""}
                onChange={(e) =>
                  onVariantFilterChange(facet.key, e.target.value)
                }
                className="w-full"
              >
                <option value="">Any {facet.key.toLowerCase()}</option>
                {variantValueOptions.map((v: VariantFacetValue) => (
                  <option key={v.value} value={v.value}>
                    {v.value} ({v.count})
                  </option>
                ))}
              </Select>
              {variantFilters[facet.key] && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onClearVariantFilter(facet.key)}
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
