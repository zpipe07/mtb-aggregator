import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchPriceHistory } from "../api";
import {
  fetchAdminStores,
  fetchAdminListings,
  fetchAdminListing,
  enrichListing,
  type AdminStore,
  type AdminListing,
} from "./api";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatAxisDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function canonCatDisplay(arr: string[] | undefined): string {
  if (!arr?.length) return "—";
  return arr.join(" > ");
}

/** Normalize metadata from API (object or JSON string). */
function getMetadataObj(metadata: AdminListing["metadata"]): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Short one-line summary for table: pull from metadata.specs (wheel_size, travel, material). */
function metadataSummary(metadata: AdminListing["metadata"]): string {
  const obj = getMetadataObj(metadata);
  if (!obj) return "—";
  const specs = obj.specs as Record<string, unknown> | undefined;
  if (!specs || typeof specs !== "object" || Object.keys(specs).length === 0) return "—";
  const parts: string[] = [];
  if (specs.wheel_size != null) parts.push(String(specs.wheel_size));
  if (specs.travel != null) parts.push(String(specs.travel));
  if (specs.material != null) parts.push(String(specs.material));
  return parts.length > 0 ? parts.slice(0, 3).join(" · ") : "—";
}

export function DataBrowser() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<number>(0);
  const [brand, setBrand] = useState("");
  const [hasEnrichment, setHasEnrichment] = useState<boolean | null>(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminListing | null>(null);
  const [priceHistory, setPriceHistory] = useState<Awaited<ReturnType<typeof fetchPriceHistory>> | null>(null);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    try {
      const s = await fetchAdminStores();
      setStores(s);
    } catch {
      setStores([]);
    }
  }, []);

  const loadListings = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminListings({
      store_id: storeId || undefined,
      brand: brand || undefined,
      has_enrichment: hasEnrichment ?? undefined,
      category: category || undefined,
      q: q || undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    })
      .then((r) => {
        setListings(r.listings);
        setTotalCount(r.total_count);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [storeId, brand, hasEnrichment, category, q, sort, offset]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      setPriceHistory(null);
      setEnrichError(null);
      return;
    }
    setEnrichError(null);
    Promise.all([fetchAdminListing(selectedId), fetchPriceHistory(selectedId)])
      .then(([list, ph]) => {
        setDetail(list ?? null);
        setPriceHistory(ph ?? null);
      })
      .catch(() => {
        setDetail(null);
        setPriceHistory(null);
      });
  }, [selectedId]);

  async function handleEnrich() {
    if (selectedId == null) return;
    setEnrichBusy(true);
    setEnrichError(null);
    try {
      await enrichListing(selectedId);
      const list = await fetchAdminListing(selectedId);
      setDetail(list ?? null);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setEnrichBusy(false);
    }
  }

  const chartData =
    priceHistory?.points.map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Data</h2>

      {error && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-48"
        />
        <select
          value={storeId}
          onChange={(e) => {
            setStoreId(Number(e.target.value));
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value={0}>All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Brand"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-32"
        />
        <select
          value={hasEnrichment === null ? "" : hasEnrichment ? "yes" : "no"}
          onChange={(e) => {
            const v = e.target.value;
            setHasEnrichment(v === "" ? null : v === "yes");
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="">Enrichment: any</option>
          <option value="yes">Enriched</option>
          <option value="no">Not enriched</option>
        </select>
        <input
          type="text"
          placeholder="Category contains"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-40"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="discount">Discount %</option>
          <option value="price_asc">Price (low)</option>
          <option value="price_desc">Price (high)</option>
          <option value="relevance">Relevance</option>
        </select>
      </div>

      {loading ? (
        <p className="text-stone-600">Loading…</p>
      ) : (
        <>
          <p className="text-sm text-stone-600 mb-2">
            {totalCount} listing{totalCount === 1 ? "" : "s"}
          </p>
          <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Product</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Store</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Brand</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Price</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Discount %</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Canonical category</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Metadata</th>
                    <th className="px-4 py-2 text-center font-medium text-stone-600">Enriched</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Last scraped</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-4 py-2 font-medium text-stone-800 max-w-xs truncate" title={row.product_name}>
                        {row.product_name}
                      </td>
                      <td className="px-4 py-2 text-stone-600">{row.store_name}</td>
                      <td className="px-4 py-2 text-stone-600">{row.brand ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        ${row.current_price.toFixed(2)}
                        {row.original_price != null && (
                          <span className="text-stone-400 ml-1">was ${row.original_price.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row.discount_pct != null ? `${Math.round(row.discount_pct)}%` : "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-xs truncate" title={canonCatDisplay(row.canonical_category)}>
                        {canonCatDisplay(row.canonical_category)}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-[10rem] truncate" title={metadataSummary(row.metadata)}>
                        {metadataSummary(row.metadata)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.last_enriched_at ? (
                          <span className="text-green-600">Yes</span>
                        ) : (
                          <span className="text-stone-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-stone-600">{formatDate(row.last_scraped)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listings.length === 0 && (
              <p className="px-4 py-6 text-center text-stone-500">No listings match the filters.</p>
            )}
            <div className="border-t border-stone-200 px-4 py-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-stone-500">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}
              </span>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= totalCount}
                className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selectedId != null && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4"
          onClick={() => setSelectedId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Listing detail"
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-lg border border-stone-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-800">Listing detail</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={enrichBusy}
                  className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
                >
                  {enrichBusy ? "Enriching…" : "Enrich"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
                >
                  Close
                </button>
              </div>
            </div>
            {enrichError && (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {enrichError}
                <button type="button" onClick={() => setEnrichError(null)} className="ml-2 underline">
                  Dismiss
                </button>
              </div>
            )}
            {detail ? (
              <div className="space-y-4 text-sm">
                <p className="font-medium text-stone-800">{detail.product_name}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-stone-500">Store</dt>
                  <dd>{detail.store_name}</dd>
                  <dt className="text-stone-500">Brand</dt>
                  <dd>{detail.brand ?? "—"}</dd>
                  <dt className="text-stone-500">Price</dt>
                  <dd>${detail.current_price.toFixed(2)} {detail.original_price != null && `(was $${detail.original_price.toFixed(2)})`}</dd>
                  <dt className="text-stone-500">SKU</dt>
                  <dd>{detail.store_sku}</dd>
                  <dt className="text-stone-500">Created</dt>
                  <dd>{formatDate(detail.created_at ?? "")}</dd>
                  <dt className="text-stone-500">Last scraped</dt>
                  <dd>{formatDate(detail.last_scraped)}</dd>
                  <dt className="text-stone-500">Last enriched</dt>
                  <dd>{detail.last_enriched_at ? formatDate(detail.last_enriched_at) : "—"}</dd>
                  <dt className="text-stone-500">Category path</dt>
                  <dd>{(detail.category_path ?? []).join(" > ") || "—"}</dd>
                  <dt className="text-stone-500">Canonical category</dt>
                  <dd>{canonCatDisplay(detail.canonical_category)}</dd>
                </dl>
                {(() => {
                  const meta = getMetadataObj(detail.metadata);
                  const specs = meta?.specs as Record<string, unknown> | undefined;
                  if (!specs || typeof specs !== "object" || Object.keys(specs).length === 0) return null;
                  return (
                    <div>
                      <h4 className="font-medium text-stone-700 mb-2">Specifications</h4>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mb-2">
                        {Object.entries(specs).map(([key, value]) => (
                          <span key={key} className="contents">
                            <dt className="text-stone-500">{key.replace(/_/g, " ")}</dt>
                            <dd>{value != null ? String(value) : "—"}</dd>
                          </span>
                        ))}
                      </dl>
                      <details className="mt-1">
                        <summary className="text-stone-500 cursor-pointer text-xs">Raw metadata JSON</summary>
                        <pre className="rounded bg-stone-100 p-2 text-xs overflow-auto max-h-24 mt-1">
                          {JSON.stringify(detail.metadata, null, 2)}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
                {chartData.length > 0 && (
                  <div>
                    <h4 className="font-medium text-stone-700 mb-2">Price history</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]} labelFormatter={(l) => l} />
                          <Line type="monotone" dataKey="price" stroke="#57534e" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-stone-500">Loading detail…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
