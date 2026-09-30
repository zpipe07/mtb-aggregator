"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { resolveUiCategorySlug } from "../lib/filterParams";
import { usePendingTimeout } from "../hooks/usePendingTimeout";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDealDetailHref } from "@/lib/dealsBackHref";
import { dealsListSurfaceFromListHref } from "@/lib/dealsListSurface";
import { Button } from "@/components/ui/button";
import {
  Toolbar,
  FilterSidebar,
  FilterDrawer,
  FilterChips,
  DealGrid,
  Pagination,
  EmptyState,
  DealsCategoryNav,
} from "../components";

type Props = {
  deals: Deal[];
  totalCount: number;
  facets: FacetsResponse;
  stores: Store[];
  categoryTree: CategoryTreeNode[];
  /** Current `/deals` URL (path + query) so deal cards preserve filters on detail → back. */
  dealsListPath: string;
  /**
   * Category slug locked by the route (SEO hubs, brand+category pages).
   * Hub paths are `/deals/hub/...`, so URL parsing cannot recover the category
   * that already scoped deals and facets.
   */
  routeCategorySlug?: string;
  /** Optional GEO intro (e.g. `/deals/c/...` routes from `getCategorySeo().intro`). Renders below the deal grid so listings stay above the fold. */
  categoryIntro?: string;
  /** Server-rendered content with the intro below the grid (e.g. Popular searches on category pages). */
  belowIntro?: ReactNode;
  /** Server-rendered slots at page bottom (e.g. curated SEO hub links after the grid). */
  children?: ReactNode;
};

export function DealsPageContent({
  deals,
  totalCount,
  facets,
  stores,
  categoryTree,
  dealsListPath,
  routeCategorySlug,
  categoryIntro,
  belowIntro,
  children,
}: Props) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const filterParams = useFilterParams({ categoryTree });
  const {
    isPending: isFilterPending,
    searchQuery,
    storeFilter,
    brandFilters,
    categoryFilter: urlCategoryFilter,
    minDiscount,
    minPrice,
    maxPrice,
    specFilters,
    sort,
    offset,
    setSearchQuery,
    setStoreFilter,
    toggleBrandFilter,
    setMinDiscount,
    setMinPrice,
    setMaxPrice,
    toggleSpecFilter,
    clearSpecFilter,
    setSort,
    setOffset,
    clearAllFilters,
    overlappingNavigations,
  } = filterParams;

  const categoryFilter = resolveUiCategorySlug(
    urlCategoryFilter,
    routeCategorySlug,
  );

  const specFilterCount = Object.values(specFilters).reduce(
    (n, values) => n + values.length,
    0,
  );

  const { isPending: resultsPending, timedOut, clearTimeoutState } =
    usePendingTimeout(isFilterPending, 15_000, {
      pathname,
      searchParams: searchParamsString,
      sort,
      offset,
      specFilterCount,
      overlappingNavigations,
    });

  const handleRetryResults = () => {
    clearTimeoutState();
    router.refresh();
  };

  const activeFilterCount =
    [storeFilter, minDiscount, minPrice, maxPrice].filter(Boolean).length +
    brandFilters.length +
    specFilterCount;

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
    if (minPrice) {
      chips.push({
        key: "min_price",
        label: `Min price: $${minPrice}`,
        onRemove: () => setMinPrice(""),
      });
    }
    if (maxPrice) {
      chips.push({
        key: "max_price",
        label: `Max price: $${maxPrice}`,
        onRemove: () => setMaxPrice(""),
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
    return chips;
  }, [
    storeFilter,
    brandFilters,
    minDiscount,
    minPrice,
    maxPrice,
    specFilters,
    facets?.spec_facets,
    setStoreFilter,
    toggleBrandFilter,
    setMinDiscount,
    setMinPrice,
    setMaxPrice,
    toggleSpecFilter,
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
  const handleMinPriceChange = (value: string) => {
    if (value)
      posthog.capture("filter_applied", { filter_type: "min_price", value });
    setMinPrice(value);
  };
  const handleMaxPriceChange = (value: string) => {
    if (value)
      posthog.capture("filter_applied", { filter_type: "max_price", value });
    setMaxPrice(value);
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
  const handleClearAllFilters = () => {
    posthog.capture("filters_cleared", {
      had_category_path: pathname.startsWith("/deals/c/"),
      had_hub_path: pathname.startsWith("/deals/hub/"),
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
  const storeFacets =
    facets.store_facets ??
    (stores ?? []).map((s) => ({ value: s.name, count: s.deal_count }));

  const filterSidebarProps = {
    storeFacets,
    brandFacets,
    storeFilter,
    brandFilters,
    minDiscount,
    minPrice,
    maxPrice,
    priceRange: facets.price_range,
    specFilters,
    specFacets: facets?.spec_facets ?? [],
    onStoreChange: handleStoreChange,
    onToggleBrand: handleToggleBrand,
    onMinDiscountChange: handleMinDiscountChange,
    onMinPriceChange: handleMinPriceChange,
    onMaxPriceChange: handleMaxPriceChange,
    onToggleSpecFilter: handleToggleSpecFilter,
    onClearSpecFilter: clearSpecFilter,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex gap-8">
        <aside className="hidden w-60 flex-shrink-0 lg:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-2rem)] min-h-[500px] flex-col rounded-[var(--radius)] border border-border bg-card p-4">
            <h2 className="mb-4 flex-shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {"// Filters"}
            </h2>
            <div className="-mr-1 min-h-0 grow overflow-y-auto pr-1">
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

          <FilterChips
            filters={activeFilters}
            onClearAll={handleClearAllFilters}
          />

          {timedOut ? (
            <div
              className="mb-4 flex flex-col gap-3 rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <p className="text-sm text-muted-foreground">
                Results couldn&apos;t be updated. Your filters are still applied.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleRetryResults}
              >
                Try again
              </Button>
            </div>
          ) : null}

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
                <div className="mb-4">
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
                  getHref={(d) => buildDealDetailHref(d.id)}
                  listSurface={dealsListSurfaceFromListHref(dealsListPath)}
                  persistBackHref={dealsListPath}
                />
              ) : (
                <EmptyState />
              )}

              {totalCount > 0 && (
                <div className="mt-8 border-t border-foreground/15">
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

          {categoryIntro || belowIntro ? (
            <div className="mt-10 space-y-6">
              {categoryIntro ? (
                <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
                  {categoryIntro}
                </p>
              ) : null}
              {belowIntro}
            </div>
          ) : null}
        </div>
      </div>

      <FilterDrawer
        {...filterSidebarProps}
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      />

      {children ? (
        <div className="mt-10 space-y-10 border-t border-foreground/15 pt-10">
          {children}
        </div>
      ) : null}
    </div>
  );
}
