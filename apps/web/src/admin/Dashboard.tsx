import { useEffect, useState } from "react";
import {
  fetchDashboard,
  triggerScrape,
  triggerEnrich,
  type DashboardResponse,
  type DashboardStore,
} from "./api";

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function storeHealthLabel(store: DashboardStore): { text: string; className: string } {
  const count = store.last_scrape_result_count;
  if (count === undefined || count === null) return { text: "—", className: "text-stone-500" };
  if (count === 0) return { text: "0 results", className: "text-amber-600" };
  return { text: String(count), className: "text-stone-700" };
}

export function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function runScrapeAll() {
    setActionBusy("scrape-all");
    try {
      await triggerScrape();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function runScrapeStore(storeType: string) {
    setActionBusy(`scrape-${storeType}`);
    try {
      await triggerScrape(storeType);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function runEnrich() {
    setActionBusy("enrich");
    try {
      await triggerEnrich(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setActionBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Dashboard</h2>
        <p className="text-stone-600">Loading…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Dashboard</h2>
        <p className="text-red-600 mb-2">{error}</p>
        <button
          type="button"
          onClick={() => load()}
          className="rounded bg-stone-200 px-3 py-1.5 text-sm hover:bg-stone-300"
        >
          Retry
        </button>
      </div>
    );
  }

  const { stats, stores, scraper_reachable, enrichment_pct } = data!;

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Dashboard</h2>

      {error && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Stores</p>
          <p className="text-2xl font-semibold text-stone-800">{stats.total_stores}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Listings</p>
          <p className="text-2xl font-semibold text-stone-800">{stats.total_listings}</p>
          <p className="text-xs text-stone-400">{stats.in_stock_listings} in stock</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Scraper</p>
          <p className={`text-2xl font-semibold ${scraper_reachable ? "text-green-600" : "text-red-600"}`}>
            {scraper_reachable ? "Reachable" : "Unreachable"}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-500">Enrichment</p>
          <p className="text-2xl font-semibold text-stone-800">
            {stats.total_listings > 0 ? `${enrichment_pct.toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-stone-400">
            {stats.enriched_listings} / {stats.total_listings} with category
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runScrapeAll}
          disabled={!!actionBusy || !scraper_reachable}
          className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {actionBusy === "scrape-all" ? "Running…" : "Scrape all stores"}
        </button>
        <button
          type="button"
          onClick={runEnrich}
          disabled={!!actionBusy}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {actionBusy === "enrich" ? "Running…" : "Run enrichment"}
        </button>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-800">
          Store health
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-2 text-left font-medium text-stone-600">Store</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Type</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Listings</th>
                <th className="px-4 py-2 text-left font-medium text-stone-600">Last scrape</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Last result count</th>
                <th className="px-4 py-2 text-right font-medium text-stone-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const health = storeHealthLabel(store);
                return (
                  <tr key={store.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-2 font-medium text-stone-800">{store.name}</td>
                    <td className="px-4 py-2 text-stone-600">{store.store_type}</td>
                    <td className="px-4 py-2 text-right">{store.deal_count}</td>
                    <td className="px-4 py-2 text-stone-600">{formatDate(store.last_scraped)}</td>
                    <td className={`px-4 py-2 text-right ${health.className}`}>{health.text}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => runScrapeStore(store.store_type)}
                        disabled={!!actionBusy || !scraper_reachable}
                        className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 disabled:opacity-50"
                      >
                        {actionBusy === `scrape-${store.store_type}` ? "…" : "Scrape"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {stores.length === 0 && (
          <p className="px-4 py-6 text-center text-stone-500">No stores configured.</p>
        )}
      </div>
    </div>
  );
}
