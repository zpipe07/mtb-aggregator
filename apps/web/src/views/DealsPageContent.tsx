"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { DEFAULT_PAGE_SIZE } from "../api";
import type {
  Deal,
  Store,
  FacetsResponse,
  CategoryTreeNode,
  BrandFacet,
} from "../api";
import { useFilterParams } from "../hooks/useFilterParams";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDealDetailHref } from "@/lib/dealsBackHref";
import {
  Toolbar,
  FilterSidebar,
  FilterDrawer,
  FilterChips,
  DealGrid,
  Pagination,
  EmptyState,
  DealsCategoryNav,
  DealsBrowseFooter,
} from "../components";

type Props = {
  deals: Deal[];
  totalCount: number;
  facets: FacetsResponse;
  stores: Store[];
  categoryTree: CategoryTreeNode[];
  /** Current `/deals` URL (path + query) so deal cards preserve filters on detail → back. */
  dealsListPath: string;
  /** Optional GEO intro (e.g. `/deals/c/...` routes from `getCategorySeo().intro`). */
  categoryIntro?: string;
};

export function DealsPageContent({
  deals,
  totalCount,
  facets,
  stores,
  categoryTree,
  dealsListPath,
  categoryIntro,
}: Props) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const pathname = usePathname();
  const filterParams = useFilterParams({ categoryTree });
  const {
    isPending: isFilterPending,
    searchQuery,
    storeFilter,
    brandFilters,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    sort,
    offset,
    setSearchQuery,
    setStoreFilter,
    toggleBrandFilter,
    setMinDiscount,
    toggleSpecFilter,
    clearSpecFilter,
    toggleVariantFilter,
    clearVariantFilter,
    setSort,
    setOffset,
    clearAllFilters,
  } = filterParams;

  const resultsPending = isFilterPending;

  const activeFilterCount =
    [storeFilter, minDiscount].filter(Boolean).length +
    brandFilters.length +
    Object.values(specFilters).reduce((n, a) => n + a.length, 0) +
    Object.values(variantFilters).reduce((n, a) => n + a.length, 0);

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (storeFilter) {
      chips.push({
        key: "store",
        label: `Store: ${storeFilter}`,
        onRemove: () => setStoreFilter(""),
      });
    }
    brandFilters.forEach((b) => {
      chips.push({
        key: `brand:${b}`,
        label: `Brand: ${b}`,
        onRemove: () => toggleBrandFilter(b),
      });
    });
    if (minDiscount) {
      chips.push({
        key: "min_discount",
        label: `Min discount: ${minDiscount}%`,
        onRemove: () => setMinDiscount(""),
      });
    }
    Object.entries(specFilters).forEach(([key, values]) => {
      const facet = facets?.spec_facets?.find((f) => f.key === key);
      const label = facet?.label ?? key;
      values.forEach((value) => {
        chips.push({
          key: `spec_${key}:${value}`,
          label: `${label}: ${value}`,
          onRemove: () => toggleSpecFilter(key, value),
        });
      });
    });
    Object.entries(variantFilters).forEach(([key, values]) => {
      values.forEach((value) => {
        chips.push({
          key: `variant_${key}:${value}`,
          label: `${key}: ${value}`,
          onRemove: () => toggleVariantFilter(key, value),
        });
      });
    });
    return chips;
  }, [
    storeFilter,
    brandFilters,
    minDiscount,
    specFilters,
    variantFilters,
    facets?.spec_facets,
    setStoreFilter,
    toggleBrandFilter,
    setMinDiscount,
    toggleSpecFilter,
    toggleVariantFilter,
  ]);

  const handleStoreChange = (value: string) => {
    if (value)
      posthog.capture("filter_applied", { filter_type: "store", value });
    setStoreFilter(value);
  };
  const handleToggleBrand = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const cur = brandFilters;
    const idx = cur.indexOf(v);
    const added = idx < 0;
    const nextCount = added ? cur.length + 1 : cur.length - 1;
    posthog.capture("filter_applied", {
      filter_type: "brand",
      value: v,
      selected_count: nextCount,
      action: added ? "add" : "remove",
    });
    toggleBrandFilter(v);
  };
  const handleMinDiscountChange = (value: string) => {
    if (value)
      posthog.capture("filter_applied", { filter_type: "min_discount", value });
    setMinDiscount(value);
  };
  const handleToggleSpecFilter = (key: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const cur = specFilters[key] ?? [];
    const idx = cur.indexOf(v);
    const added = idx < 0;
    const nextCount = added ? cur.length + 1 : cur.length - 1;
    posthog.capture("filter_applied", {
      filter_type: "spec",
      spec_key: key,
      value: v,
      selected_count: nextCount,
      action: added ? "add" : "remove",
    });
    toggleSpecFilter(key, v);
  };
  const handleToggleVariantFilter = (key: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const cur = variantFilters[key] ?? [];
    const idx = cur.indexOf(v);
    const added = idx < 0;
    const nextCount = added ? cur.length + 1 : cur.length - 1;
    posthog.capture("filter_applied", {
      filter_type: "variant",
      variant_key: key,
      value: v,
      selected_count: nextCount,
      action: added ? "add" : "remove",
    });
    toggleVariantFilter(key, v);
  };
  const handleClearAllFilters = () => {
    posthog.capture("filters_cleared", {
      had_category_path: pathname.startsWith("/deals/c/"),
    });
    clearAllFilters();
  };
  const handlePageChange = (newOffset: number) => {
    posthog.capture("deals_paginated", {
      page: Math.floor(newOffset / DEFAULT_PAGE_SIZE) + 1,
      offset: newOffset,
    });
    setOffset(newOffset);
  };
  const handleFilterDrawerOpen = () => {
    posthog.capture("filter_drawer_opened");
    setFilterDrawerOpen(true);
  };
  const brandFacets: BrandFacet[] = facets.brand_facets ?? [];

  const filterSidebarProps = {
    stores,
    brandFacets,
    storeFilter,
    brandFilters,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    specFacets: facets?.spec_facets ?? [],
    variantFacets: facets?.variant_facets ?? [],
    onStoreChange: handleStoreChange,
    onToggleBrand: handleToggleBrand,
    onMinDiscountChange: handleMinDiscountChange,
    onToggleSpecFilter: handleToggleSpecFilter,
    onClearSpecFilter: clearSpecFilter,
    onToggleVariantFilter: handleToggleVariantFilter,
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
            onFilterClick={handleFilterDrawerOpen}
            activeFilterCount={activeFilterCount}
          />

          <DealsCategoryNav
            categoryTree={categoryTree}
            categoryFilter={categoryFilter}
          />

          {categoryIntro ? (
            <p className="text-sm text-muted-foreground mb-4 max-w-3xl leading-relaxed">
              {categoryIntro}
            </p>
          ) : null}

          <FilterChips
            filters={activeFilters}
            onClearAll={handleClearAllFilters}
          />

          <div className="relative" aria-busy={resultsPending}>
            {resultsPending && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-24 sm:pt-32"
                aria-hidden
              >
                <Loader2
                  className="size-8 animate-spin text-muted-foreground"
                  aria-hidden
                />
              </div>
            )}

            <div
              className={cn(
                "transition-opacity duration-150",
                resultsPending && "pointer-events-none opacity-50",
              )}
            >
              {totalCount > 0 && (
                <div className="border-b-2 border-border/50 mb-4">
                  <Pagination
                    totalCount={totalCount}
                    limit={DEFAULT_PAGE_SIZE}
                    offset={offset}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}

              {deals.length > 0 ? (
                <DealGrid
                  deals={deals}
                  getHref={(d) => buildDealDetailHref(d.id, dealsListPath)}
                />
              ) : (
                <EmptyState />
              )}

              {totalCount > 0 && (
                <div className="border-t-2 border-border/50 mt-8">
                  <Pagination
                    totalCount={totalCount}
                    limit={DEFAULT_PAGE_SIZE}
                    offset={offset}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FilterDrawer
        {...filterSidebarProps}
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      />

      <DealsBrowseFooter
        rootCategories={categoryTree}
        categoryTree={categoryTree}
      />
    </div>
  );
}
