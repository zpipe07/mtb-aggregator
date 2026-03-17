import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_PAGE_SIZE } from "../api";
import {
  useDeals,
  useFilterFacets,
  useStores,
  useBrands,
  useCategoryTree,
} from "../hooks/queries";
import { useFilterParams } from "../hooks/useFilterParams";
import {
  Toolbar,
  FilterSidebar,
  FilterDrawer,
  FilterChips,
  DealGrid,
  DealDetailModal,
  Pagination,
  ErrorMessage,
  LoadingState,
  EmptyState,
} from "../components";

export function DealsPage() {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const filterParams = useFilterParams();
  const {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    sort,
    offset,
    setSearchQuery,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setMinDiscount,
    setSpecFilter,
    clearSpecFilter,
    setSort,
    setOffset,
    clearAllFilters,
  } = filterParams;

  const [searchParams, setSearchParams] = useSearchParams();
  const dealParam = searchParams.get("deal");
  const selectedDealId = dealParam ? parseInt(dealParam, 10) || null : null;
  const setSelectedDealId = useCallback(
    (id: number | null) => {
      setSearchParams((prev: URLSearchParams) => {
        const next = new URLSearchParams(prev);
        if (id == null) next.delete("deal");
        else next.set("deal", String(id));
        return next;
      });
    },
    [setSearchParams],
  );

  const { data: storesData } = useStores();
  const { data: brandsData } = useBrands();
  const { data: categoryTreeData } = useCategoryTree();

  const categoryTree = categoryTreeData ?? [];
  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset,
    store: storeFilter || undefined,
    brand: brandFilter || undefined,
    category_slug: categoryFilter || undefined,
    min_discount: minDiscount
      ? parseFloat(minDiscount) || undefined
      : undefined,
    specFilters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    q: searchQuery.trim() || undefined,
    sort,
  };
  const {
    data: dealsData,
    isPending: loading,
    isError,
    error,
  } = useDeals(dealsParams);

  const facetsParams = {
    store: storeFilter || undefined,
    brand: brandFilter || undefined,
    category_slug: categoryFilter || undefined,
    min_discount: minDiscount
      ? parseFloat(minDiscount) || undefined
      : undefined,
    specFilters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    q: searchQuery.trim() || undefined,
  };
  const { data: facetsData } = useFilterFacets(facetsParams);

  const stores = storesData ?? [];
  const brands = brandsData ?? [];
  const deals = dealsData?.deals ?? [];
  const totalCount = dealsData?.total_count ?? 0;

  const activeFilterCount =
    [storeFilter, brandFilter, categoryFilter, minDiscount].filter(
      Boolean,
    ).length + Object.values(specFilters).filter(Boolean).length;

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
        flat.find((x) => x.slug === categoryFilter)?.path?.split(" > ").pop() ?? categoryFilter;
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
        const facet = facetsData?.spec_facets?.find((f) => f.key === key);
        const label = facet?.label ?? key;
        chips.push({
          key: `spec_${key}`,
          label: `${label}: ${value}`,
          onRemove: () => setSpecFilter(key, ""),
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
    facetsData?.spec_facets,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setMinDiscount,
    setSpecFilter,
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
    specFacets: facetsData?.spec_facets ?? [],
    onStoreChange: setStoreFilter,
    onBrandChange: setBrandFilter,
    onCategoryChange: setCategoryFilter,
    onMinDiscountChange: setMinDiscount,
    onSpecFilterChange: setSpecFilter,
    onClearSpecFilter: clearSpecFilter,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
      <div className="flex gap-8">
        {/* Desktop sidebar - hidden on mobile, sticky with scrollable filters */}
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

        {/* Main content - scrolls with page normally */}
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

          {!loading && !isError && (
            <p className="text-sm text-muted-foreground mb-4">
              {totalCount === 0
                ? "No deals found"
                : `${totalCount} deal${totalCount === 1 ? "" : "s"} found`}
            </p>
          )}

          {!loading && !isError && totalCount > 0 && (
            <div className="border-b border-border mb-4">
              <Pagination
                totalCount={totalCount}
                limit={DEFAULT_PAGE_SIZE}
                offset={offset}
                onPageChange={setOffset}
              />
            </div>
          )}

          {isError && (
            <ErrorMessage message={error?.message ?? "Failed to load"} />
          )}

          {loading ? (
            <LoadingState />
          ) : (
            <DealGrid
              deals={deals}
              onSelectDeal={(d) => setSelectedDealId(d.id)}
            />
          )}

          {!loading && !isError && deals.length === 0 && <EmptyState />}

          {!loading && !isError && totalCount > 0 && (
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

      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
      />
    </div>
  );
}
