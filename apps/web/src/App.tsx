import { useEffect, useState } from "react";
import {
  fetchDeals,
  fetchStores,
  fetchBrands,
  fetchCategories,
  fetchStatus,
  type Deal,
  type Store,
} from "./api";
import {
  AppHeader,
  StatusBar,
  DealFilters,
  DealGrid,
  ErrorMessage,
  LoadingState,
  EmptyState,
  type SortOption,
} from "./components";

function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minDiscount, setMinDiscount] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
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
    const params: Parameters<typeof fetchDeals>[0] = { limit: 100 };
    if (storeFilter) params.store = storeFilter;
    if (brandFilter) params.brand = brandFilter;
    if (categoryFilter) params.category = categoryFilter;
    if (minDiscount) params.min_discount = parseFloat(minDiscount) || undefined;
    fetchDeals(params)
      .then((data) => {
        setDeals(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [storeFilter, brandFilter, categoryFilter, minDiscount]);

  const sortedDeals = (Array.isArray(deals) ? deals : [])
    .slice()
    .sort((a, b) => {
      switch (sort) {
        case "discount":
          return (b.discount_pct ?? 0) - (a.discount_pct ?? 0);
        case "price_asc":
          return a.current_price - b.current_price;
        case "price_desc":
          return b.current_price - a.current_price;
        default:
          return (
            new Date(b.last_scraped).getTime() -
            new Date(a.last_scraped).getTime()
          );
      }
    });

  return (
    <div className="min-h-screen bg-stone-100">
      <AppHeader />

      {status && <StatusBar status={status} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <DealFilters
          stores={stores}
          brands={brands}
          categories={categories}
          storeFilter={storeFilter}
          brandFilter={brandFilter}
          categoryFilter={categoryFilter}
          minDiscount={minDiscount}
          sort={sort}
          onStoreChange={setStoreFilter}
          onBrandChange={setBrandFilter}
          onCategoryChange={setCategoryFilter}
          onMinDiscountChange={setMinDiscount}
          onSortChange={setSort}
        />

        {error && <ErrorMessage message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <DealGrid deals={sortedDeals} />
        )}

        {!loading && !error && sortedDeals.length === 0 && <EmptyState />}
      </main>
    </div>
  );
}

export default App;
