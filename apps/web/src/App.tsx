import { useCallback } from "react";
import { useSearchParams, Routes, Route } from "react-router-dom";
import { DEFAULT_PAGE_SIZE } from "./api";
import {
  useDeals,
  useFilterFacets,
  useStores,
  useBrands,
  useCategories,
  useCanonicalCategories,
  useStatus,
} from "./hooks/queries";
import { useFilterParams } from "./hooks/useFilterParams";
import {
  AppHeader,
  StatusBar,
  SearchBar,
  DealFilters,
  DealGrid,
  DealDetailModal,
  Pagination,
  ErrorMessage,
  LoadingState,
  EmptyState,
} from "./components";
import { AdminSection } from "./admin";

function DealsPage() {
  const filterParams = useFilterParams();
  const {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    canonicalCategoryFilter,
    minDiscount,
    specFilters,
    sort,
    offset,
    setSearchQuery,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setCanonicalCategoryFilter,
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
    [setSearchParams]
  );

  const { data: storesData } = useStores();
  const { data: statusData } = useStatus();
  const { data: brandsData } = useBrands();
  const { data: categoriesData } = useCategories();
  const { data: canonicalData } = useCanonicalCategories();

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset,
    store: storeFilter || undefined,
    brand: brandFilter || undefined,
    category: categoryFilter || undefined,
    canonical_category: canonicalCategoryFilter || undefined,
    min_discount: minDiscount ? parseFloat(minDiscount) || undefined : undefined,
    specFilters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    q: searchQuery.trim() || undefined,
    sort,
  };
  const { data: dealsData, isPending: loading, isError, error } = useDeals(dealsParams);

  const facetsParams = {
    store: storeFilter || undefined,
    brand: brandFilter || undefined,
    category: categoryFilter || undefined,
    canonical_category: canonicalCategoryFilter || undefined,
    min_discount: minDiscount ? parseFloat(minDiscount) || undefined : undefined,
    specFilters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    q: searchQuery.trim() || undefined,
  };
  const { data: facetsData } = useFilterFacets(facetsParams);

  const stores = storesData ?? [];
  const brands = brandsData ?? [];
  const categories = categoriesData ?? [];
  const canonicalCategories = canonicalData ?? [];
  const deals = dealsData?.deals ?? [];
  const totalCount = dealsData?.total_count ?? 0;

  const activeFilterCount =
    [storeFilter, brandFilter, categoryFilter, canonicalCategoryFilter, minDiscount].filter(
      Boolean
    ).length + Object.values(specFilters).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-stone-100">
      <AppHeader />

      {statusData && <StatusBar status={statusData} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        <DealFilters
          stores={stores}
          brands={brands}
          categories={categories}
          canonicalCategories={canonicalCategories}
          storeFilter={storeFilter}
          brandFilter={brandFilter}
          categoryFilter={categoryFilter}
          canonicalCategoryFilter={canonicalCategoryFilter}
          minDiscount={minDiscount}
          specFilters={specFilters}
          specFacets={facetsData?.spec_facets ?? []}
          sort={sort}
          searchQuery={searchQuery}
          onStoreChange={setStoreFilter}
          onBrandChange={setBrandFilter}
          onCategoryChange={setCategoryFilter}
          onCanonicalCategoryChange={setCanonicalCategoryFilter}
          onMinDiscountChange={setMinDiscount}
          onSpecFilterChange={setSpecFilter}
          onClearSpecFilter={clearSpecFilter}
          onSortChange={setSort}
          activeFilterCount={activeFilterCount}
          onClearAll={clearAllFilters}
        />

        {!loading && !isError && (
          <p className="text-sm text-stone-600 mb-4">
            {totalCount === 0
              ? "No deals found"
              : `${totalCount} deal${totalCount === 1 ? "" : "s"} found`}
          </p>
        )}

        {!loading && !isError && totalCount > 0 && (
          <div className="border-b border-stone-200 mb-4">
            <Pagination
              totalCount={totalCount}
              limit={DEFAULT_PAGE_SIZE}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        )}

        {isError && <ErrorMessage message={error?.message ?? "Failed to load"} />}

        {loading ? (
          <LoadingState />
        ) : (
          <DealGrid deals={deals} onSelectDeal={(d) => setSelectedDealId(d.id)} />
        )}

        <DealDetailModal
          dealId={selectedDealId}
          onClose={() => setSelectedDealId(null)}
        />

        {!loading && !isError && deals.length === 0 && <EmptyState />}

        {!loading && !isError && totalCount > 0 && (
          <div className="border-t border-stone-200 mt-8">
            <Pagination
              totalCount={totalCount}
              limit={DEFAULT_PAGE_SIZE}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<DealsPage />} />
      <Route path="/admin/*" element={<AdminSection />} />
    </Routes>
  );
}

export default App;
