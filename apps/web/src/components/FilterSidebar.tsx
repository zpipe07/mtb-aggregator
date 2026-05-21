import { useMemo } from "react";
import type { BrandFacet, SpecFacet, Store } from "../api";
import { buildMinDiscountSelectOptions } from "../lib/minDiscountFilterOptions";
import { FilterSelect } from "./FilterSelect";
import { Button } from "./ui/button";
import { CheckboxGroup } from "./ui/checkbox-group";

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
  /** Category filter (slug) — used to scope spec facets; category UI lives above the deals grid. */
  categoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string[]>;
  specFacets: SpecFacet[];
  onStoreChange: (value: string) => void;
  onToggleBrand: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onToggleSpecFilter: (key: string, value: string) => void;
  onClearSpecFilter: (key: string) => void;
};

export function FilterSidebar({
  stores,
  brandFacets,
  storeFilter,
  brandFilters,
  categoryFilter,
  minDiscount,
  specFilters,
  specFacets,
  onStoreChange,
  onToggleBrand,
  onMinDiscountChange,
  onToggleSpecFilter,
  onClearSpecFilter,
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
    <div className="space-y-6 pr-1">
      <CheckboxGroup
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
        <div className="space-y-4 border-t border-foreground/15 pt-4">
          {specFacets.map((facet) => {
            const specValueOptions = mergeSelectedFacetValues(
              facet.values,
              specFilters[facet.key],
            );
            const nSel = specFilters[facet.key]?.length ?? 0;
            return (
              <div key={facet.key}>
                <CheckboxGroup
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
    </div>
  );
}
