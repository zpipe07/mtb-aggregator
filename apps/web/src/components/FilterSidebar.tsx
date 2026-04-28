import { useId, useMemo } from "react";
import type {
  BrandFacet,
  SpecFacet,
  Store,
  VariantFacet,
  VariantFacetValue,
} from "../api";
import { buildMinDiscountSelectOptions } from "../lib/minDiscountFilterOptions";
import { sanitizeForHtmlId } from "../lib/htmlId";
import { FilterSelect } from "./FilterSelect";
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

export type FilterSidebarProps = {
  stores: Store[];
  brandFacets: BrandFacet[];
  storeFilter: string;
  brandFilter: string;
  /** Category filter (slug) — used to scope spec/variant facets; category UI lives above the deals grid. */
  categoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  variantFilters: Record<string, string>;
  specFacets: SpecFacet[];
  variantFacets?: VariantFacet[];
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSpecFilterChange: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
  onVariantFilterChange: (key: string, value: string) => void;
  onClearVariantFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brandFacets,
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
  onMinDiscountChange,
  onSpecFilterChange,
  onClearSpecFilter,
  onVariantFilterChange,
  onClearVariantFilter,
}: FilterSidebarProps) {
  const specFacetIdPrefix = useId();
  const variantFacetIdPrefix = useId();

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

  return (
    <div className="space-y-6">
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

      <FilterSelect
        label="Min discount"
        value={minDiscount}
        onChange={onMinDiscountChange}
        options={buildMinDiscountSelectOptions(minDiscount)}
      />

      {categoryFilter && specFacets.length > 0 && (
        <div className="space-y-4 border-t-2 border-border/50 pt-4">
          {specFacets.map((facet) => {
            const specValueOptions = mergeSelectedFacetValue(
              facet.values,
              specFilters[facet.key],
            );
            return (
            <div key={facet.key}>
              <label
                htmlFor={`${specFacetIdPrefix}-${sanitizeForHtmlId(facet.key)}`}
                className="block text-sm font-medium text-muted-foreground mb-1.5"
              >
                {facet.label}
              </label>
              <Select
                id={`${specFacetIdPrefix}-${sanitizeForHtmlId(facet.key)}`}
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
        <div className="space-y-4 border-t-2 border-border/50 pt-4">
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
              <label
                htmlFor={`${variantFacetIdPrefix}-${sanitizeForHtmlId(facet.key)}`}
                className="block text-sm font-medium text-muted-foreground mb-1.5"
              >
                {facet.key}
              </label>
              <Select
                id={`${variantFacetIdPrefix}-${sanitizeForHtmlId(facet.key)}`}
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
