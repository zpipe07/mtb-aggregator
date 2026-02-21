import { useEffect, useState } from "react";
import {
  fetchDeals,
  fetchStores,
  fetchBrands,
  fetchCategories,
  fetchStatus,
  DEFAULT_PAGE_SIZE,
  type Deal,
  type Store,
} from "./api";
import {
  AppHeader,
  StatusBar,
  SearchBar,
  DealFilters,
  DealGrid,
  Pagination,
  ErrorMessage,
  LoadingState,
  EmptyState,
  type SortOption,
} from "./components";

function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minDiscount, setMinDiscount] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [offset, setOffset] = useState(0);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof fetchStatus>
  > | null>(null);

  useEffect(() => {
    fetchStores()
      .then(setStores)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    fetchBrands()
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = {
      limit: DEFAULT_PAGE_SIZE,
      offset,
      store: storeFilter || undefined,
      brand: brandFilter || undefined,
      category: categoryFilter || undefined,
      min_discount: minDiscount ? parseFloat(minDiscount) || undefined : undefined,
      q: searchQuery.trim() || undefined,
      sort,
    };
    fetchDeals(params)
      .then((data) => {
        setDeals(data.deals);
        setTotalCount(data.total_count);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [searchQuery, storeFilter, brandFilter, categoryFilter, minDiscount, sort, offset]);

  useEffect(() => {
    if (searchQuery.trim() === "" && sort === "relevance") setSort("newest");
  }, [searchQuery, sort]);

  return (
    <div className="min-h-screen bg-stone-100">
      <AppHeader />

      {status && <StatusBar status={status} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <SearchBar
            value={searchQuery}
            onChange={(q) => {
              setSearchQuery(q);
              setOffset(0);
            }}
          />
        </div>

        <DealFilters
          stores={stores}
          brands={brands}
          categories={categories}
          storeFilter={storeFilter}
          brandFilter={brandFilter}
          categoryFilter={categoryFilter}
          minDiscount={minDiscount}
          sort={sort}
          searchQuery={searchQuery}
          onStoreChange={(v) => {
            setStoreFilter(v);
            setOffset(0);
          }}
          onBrandChange={(v) => {
            setBrandFilter(v);
            setOffset(0);
          }}
          onCategoryChange={(v) => {
            setCategoryFilter(v);
            setOffset(0);
          }}
          onMinDiscountChange={(v) => {
            setMinDiscount(v);
            setOffset(0);
          }}
          onSortChange={(v) => {
            setSort(v);
            setOffset(0);
          }}
        />

        {!loading && !error && (
          <p className="text-sm text-stone-600 mb-4">
            {totalCount === 0
              ? "No deals found"
              : `${totalCount} deal${totalCount === 1 ? "" : "s"} found`}
          </p>
        )}

        {!loading && !error && totalCount > 0 && (
          <div className="border-b border-stone-200 mb-4">
            <Pagination
              totalCount={totalCount}
              limit={DEFAULT_PAGE_SIZE}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        )}

        {error && <ErrorMessage message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <DealGrid deals={deals} />
        )}

        {!loading && !error && deals.length === 0 && <EmptyState />}

        {!loading && !error && totalCount > 0 && (
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

export default App;
