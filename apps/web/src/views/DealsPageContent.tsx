"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "../api";
import type { Deal, Store, FacetsResponse, CategoryTreeNode } from "../api";
import { useFilterParams } from "../hooks/useFilterParams";
import {
  Toolbar,
  FilterSidebar,
  FilterDrawer,
  FilterChips,
  DealGrid,
  Pagination,
  EmptyState,
} from "../components";

type Props = {
  deals: Deal[];
  totalCount: number;
  facets: FacetsResponse;
  stores: Store[];
  brands: string[];
  categoryTree: CategoryTreeNode[];
};

export function DealsPageContent({
  deals,
  totalCount,
  facets,
  stores,
  brands,
  categoryTree,
}: Props) {
  const router = useRouter();
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const filterParams = useFilterParams();
  const {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    sort,
    offset,
    setSearchQuery,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setMinDiscount,
    setSpecFilter,
    clearSpecFilter,
    setVariantFilter,
    clearVariantFilter,
    setSort,
    setOffset,
    clearAllFilters,
  } = filterParams;

  const activeFilterCount =
    [storeFilter, brandFilter, categoryFilter, minDiscount].filter(Boolean)
      .length +
    Object.values(specFilters).filter(Boolean).length +
    Object.values(variantFilters).filter(Boolean).length;

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (storeFilter) {
      chips.push({
        key: "store",
        label: `Store: ${storeFilter}`,
        onRemove: () => setStoreFilter(""),
      });
    }
    if (brandFilter) {
      chips.push({
        key: "brand",
        label: `Brand: ${brandFilter}`,
        onRemove: () => setBrandFilter(""),
      });
    }
    if (categoryFilter) {
      const flat = categoryTree
        ? (() => {
            const r: { slug: string; path: string }[] = [];
            function f(t: typeof categoryTree, p = "") {
              for (const n of t) {
                const path = p ? `${p} > ${n.name}` : n.name;
                r.push({ slug: n.slug, path });
                if (n.children?.length) f(n.children, path);
              }
            }
            f(categoryTree);
            return r;
          })()
        : [];
      const label =
        flat.find((x) => x.slug === categoryFilter)?.path?.split(" > ").pop() ??
        categoryFilter;
      chips.push({
        key: "category",
        label: `Category: ${label}`,
        onRemove: () => setCategoryFilter(""),
      });
    }
    if (minDiscount) {
      chips.push({
        key: "min_discount",
        label: `Min discount: ${minDiscount}%`,
        onRemove: () => setMinDiscount(""),
      });
    }
    Object.entries(specFilters).forEach(([key, value]) => {
      if (value) {
        const facet = facets?.spec_facets?.find((f) => f.key === key);
        const label = facet?.label ?? key;
        chips.push({
          key: `spec_${key}`,
          label: `${label}: ${value}`,
          onRemove: () => setSpecFilter(key, ""),
        });
      }
    });
    Object.entries(variantFilters).forEach(([key, value]) => {
      if (value) {
        chips.push({
          key: `variant_${key}`,
          label: `${key}: ${value}`,
          onRemove: () => setVariantFilter(key, ""),
        });
      }
    });
    return chips;
  }, [
    storeFilter,
    brandFilter,
    categoryFilter,
    categoryTree,
    minDiscount,
    specFilters,
    variantFilters,
    facets?.spec_facets,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setMinDiscount,
    setSpecFilter,
    setVariantFilter,
  ]);

  const filterSidebarProps = {
    stores,
    brands,
    categoryTree: categoryTree ?? undefined,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    specFacets: facets?.spec_facets ?? [],
    variantFacets: facets?.variant_facets ?? [],
    onStoreChange: setStoreFilter,
    onBrandChange: setBrandFilter,
    onCategoryChange: setCategoryFilter,
    onMinDiscountChange: setMinDiscount,
    onSpecFilterChange: setSpecFilter,
    onClearSpecFilter: clearSpecFilter,
    onVariantFilterChange: setVariantFilter,
    onClearVariantFilter: clearVariantFilter,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
      <div className="flex gap-8">
        <aside className="hidden lg:block w-60 flex-shrink-0">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col min-h-[500px]">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex-shrink-0">
              Filters
            </h2>
            <div className="overflow-y-auto pr-1 -mr-1 grow">
              <FilterSidebar {...filterSidebarProps} />
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <Toolbar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            sort={sort}
            onSortChange={setSort}
            searchQuery={searchQuery}
            onFilterClick={() => setFilterDrawerOpen(true)}
            activeFilterCount={activeFilterCount}
          />

          <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />

          <p className="text-sm text-muted-foreground mb-4">
            {totalCount === 0
              ? "No deals found"
              : `${totalCount} deal${totalCount === 1 ? "" : "s"} found`}
          </p>

          {totalCount > 0 && (
            <div className="border-b border-border mb-4">
              <Pagination
                totalCount={totalCount}
                limit={DEFAULT_PAGE_SIZE}
                offset={offset}
                onPageChange={setOffset}
              />
            </div>
          )}

          {deals.length > 0 ? (
            <DealGrid
              deals={deals}
              onSelectDeal={(d) => router.push(`/deals/${d.id}`)}
            />
          ) : (
            <EmptyState />
          )}

          {totalCount > 0 && (
            <div className="border-t border-border mt-8">
              <Pagination
                totalCount={totalCount}
                limit={DEFAULT_PAGE_SIZE}
                offset={offset}
                onPageChange={setOffset}
              />
            </div>
          )}
        </div>
      </div>

      <FilterDrawer
        {...filterSidebarProps}
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      />
    </div>
  );
}
