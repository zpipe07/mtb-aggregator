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

type SortOption = "newest" | "discount" | "price_asc" | "price_desc";

function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [minDiscount, setMinDiscount] = useState<string>("");
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
      <header className="bg-stone-800 text-white py-6 px-6">
        <h1 className="text-2xl font-bold tracking-tight">
          MTB Deal Aggregator
        </h1>
        <p className="text-stone-400 mt-1">
          Mountain bike deals from top retailers
        </p>
      </header>

      {status && (
        <div className="bg-stone-200 border-b border-stone-300 px-6 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${status.scraper_reachable ? "bg-green-600" : "bg-red-500"}`}
                title={
                  status.scraper_reachable
                    ? "Scraper reachable"
                    : "Scraper offline"
                }
              />
              <span className="text-stone-700">
                Scraper {status.scraper_reachable ? "online" : "offline"}
              </span>
            </div>
            {status.stores.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2 text-stone-600"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${s.success ? "bg-green-600" : "bg-amber-500"}`}
                  title={s.success ? "Has scraped data" : "No data yet"}
                />
                <span>{s.name}:</span>
                <span>
                  {s.last_scraped
                    ? new Date(s.last_scraped).toLocaleString()
                    : "—"}
                </span>
                <span className="text-stone-500">({s.deal_count} deals)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Store
            </label>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.deal_count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Brand
            </label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Min discount %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 20"
              value={minDiscount}
              onChange={(e) => setMinDiscount(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 w-24"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Sort by
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800"
            >
              <option value="newest">Newest</option>
              <option value="discount">Highest discount</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-stone-500 py-12 text-center">
            Loading deals...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}

        {!loading && !error && sortedDeals.length === 0 && (
          <div className="text-stone-500 py-12 text-center">
            No deals found.
          </div>
        )}
      </main>
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const viewUrl = deal.affiliate_url || deal.product_url;
  const discountPct =
    deal.discount_pct != null ? Math.round(deal.discount_pct) : null;

  return (
    <article className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-stone-200 relative">
        {deal.image_url ? (
          <img
            src={deal.image_url}
            alt={deal.product_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
            No image
          </div>
        )}
        {discountPct != null && discountPct > 0 && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
            {discountPct}% off
          </span>
        )}
        <span className="absolute top-2 right-2 bg-stone-800/80 text-white text-xs px-2 py-1 rounded">
          {deal.store_name}
        </span>
      </div>
      <div className="p-4">
        {deal.brand && (
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            {deal.brand}
          </span>
        )}
        <h2 className="font-medium text-stone-900 line-clamp-2">
          {deal.product_name}
        </h2>
        {deal.category_path && deal.category_path.length > 0 && (
          <p className="text-xs text-stone-500 mt-1">
            {deal.category_path[deal.category_path.length - 1]}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-stone-900">
            ${deal.current_price.toFixed(2)}
          </span>
          {deal.original_price != null &&
            deal.original_price > deal.current_price && (
              <span className="text-sm text-stone-500 line-through">
                ${deal.original_price.toFixed(2)}
              </span>
            )}
        </div>
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full text-center bg-stone-800 hover:bg-stone-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          View Deal
        </a>
      </div>
    </article>
  );
}

export default App;
