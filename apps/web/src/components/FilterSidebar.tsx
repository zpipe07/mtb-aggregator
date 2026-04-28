import { useMemo } from "react";
import type { BrandFacet, SpecFacet, Store, VariantFacet } from "../api";
import { buildMinDiscountSelectOptions } from "../lib/minDiscountFilterOptions";
import { FilterSelect } from "./FilterSelect";
import { Button } from "./ui/button";
import { FacetCheckboxGroup } from "./ui/facet-checkbox-group";

/** If the URL has selected values not present in facet values (stale bookmark), show them so the user can clear or change. */
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

export type FilterSidebarProps = {
  stores: Store[];
  brandFacets: BrandFacet[];
  storeFilter: string;
  brandFilters: string[];
  /** Category filter (slug) — used to scope spec/variant facets; category UI lives above the deals grid. */
  categoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string[]>;
  variantFilters: Record<string, string[]>;
  specFacets: SpecFacet[];
  variantFacets?: VariantFacet[];
  onStoreChange: (value: string) => void;
  onToggleBrand: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onToggleSpecFilter: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
  onToggleVariantFilter: (key: string, value: string) => void;
  onClearVariantFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brandFacets,
  storeFilter,
  brandFilters,
  categoryFilter,
  minDiscount,
  specFilters,
  variantFilters,
  specFacets,
  variantFacets = [],
  onStoreChange,
  onToggleBrand,
  onMinDiscountChange,
  onToggleSpecFilter,
  onClearSpecFilter,
  onToggleVariantFilter,
  onClearVariantFilter,
}: FilterSidebarProps) {
  const storeOptions = [
    { value: "", label: "All stores" },
    ...(stores ?? []).map((s) => ({
      value: s.name,
      label: `${s.name} (${s.deal_count})`,
    })),
  ];

  const brandCheckboxOptions = useMemo(() => {
    const facetList = brandFacets ?? [];
    return mergeSelectedFacetValues(facetList, brandFilters);
  }, [brandFacets, brandFilters]);

  return (
    <div className="space-y-6">
      <FacetCheckboxGroup
        name="facet-brand"
        legend="Brand"
        selected={brandFilters}
        options={brandCheckboxOptions}
        onToggle={onToggleBrand}
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
            const specValueOptions = mergeSelectedFacetValues(
              facet.values,
              specFilters[facet.key],
            );
            const nSel = specFilters[facet.key]?.length ?? 0;
            return (
              <div key={facet.key}>
                <FacetCheckboxGroup
                  name={`facet-spec-${facet.key}`}
                  legend={facet.label}
                  selected={specFilters[facet.key] ?? []}
                  options={specValueOptions}
                  onToggle={(v) => onToggleSpecFilter(facet.key, v)}
                />
                {nSel > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => onClearSpecFilter(facet.key)}
                    className="mt-1 h-auto p-0 text-sm text-muted-foreground"
                  >
                    Clear {facet.label}
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
            const variantValueOptions = mergeSelectedFacetValues(
              facet.values,
              variantFilters[facet.key],
            );
            const nSel = variantFilters[facet.key]?.length ?? 0;
            return (
              <div key={facet.key}>
                <FacetCheckboxGroup
                  name={`facet-variant-${facet.key}`}
                  legend={facet.key}
                  selected={variantFilters[facet.key] ?? []}
                  options={variantValueOptions}
                  onToggle={(v) => onToggleVariantFilter(facet.key, v)}
                />
                {nSel > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => onClearVariantFilter(facet.key)}
                    className="mt-1 h-auto p-0 text-sm text-muted-foreground"
                  >
                    Clear {facet.key}
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
