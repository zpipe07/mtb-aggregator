import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePriceHistory } from "../hooks/queries";
import {
  useAdminStores,
  useAdminListings,
  useAdminListing,
} from "./hooks/queries";
import { useEnrichListing, useSetListingHidden, useSetListingLLMOverrides } from "./hooks/mutations";
import type { AdminListing } from "./api";

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

/** Get displayed spec value: llm_overrides[key] ?? llm_specs[key] ?? specs[key] (legacy). */
function getDisplayedSpec(metadata: AdminListing["metadata"], key: string): string | undefined {
  const obj = getMetadataObj(metadata);
  if (!obj) return undefined;
  const overrides = obj.llm_overrides as Record<string, string> | undefined;
  if (overrides && typeof overrides[key] === "string") return overrides[key];
  const llmSpecs = obj.llm_specs as Record<string, unknown> | undefined;
  if (llmSpecs && llmSpecs[key] != null) return String(llmSpecs[key]);
  const specs = obj.specs as Record<string, unknown> | undefined;
  if (specs && specs[key] != null) return String(specs[key]);
  return undefined;
}

/** Check if a spec key has an override. */
function hasOverride(metadata: AdminListing["metadata"], key: string): boolean {
  const obj = getMetadataObj(metadata);
  const overrides = obj?.llm_overrides as Record<string, unknown> | undefined;
  return !!(overrides && key in overrides);
}

/** Short one-line summary for table: pull from llm_overrides ?? llm_specs ?? specs (legacy). */
function metadataSummary(metadata: AdminListing["metadata"]): string {
  const obj = getMetadataObj(metadata);
  if (!obj) return "—";
  const llmSpecs = obj.llm_specs as Record<string, unknown> | undefined;
  const specs = obj.specs as Record<string, unknown> | undefined;
  const overrides = obj.llm_overrides as Record<string, unknown> | undefined;
  const get = (k: string) => {
    const v = (overrides && typeof overrides[k] === "string" ? overrides[k] : null) ?? llmSpecs?.[k] ?? specs?.[k];
    return v != null ? String(v) : null;
  };
  const parts: (string | null)[] = [get("wheel_size"), get("front_travel_mm") ?? get("rear_travel_mm"), get("mtb_class")];
  const filtered = parts.filter((p): p is string => p != null && p !== "");
  return filtered.length > 0 ? filtered.slice(0, 3).join(" · ") : "—";
}

/** Get llm_confidence from metadata (0–1). */
function getLLMConfidence(metadata: AdminListing["metadata"]): number | null {
  const obj = getMetadataObj(metadata);
  if (!obj) return null;
  const v = obj.llm_confidence;
  if (typeof v === "number" && v >= 0 && v <= 1) return v;
  return null;
}

/** Get LLM category classification from metadata.llm_category. */
function getLLMCategory(metadata: AdminListing["metadata"]): { canonical_category: string[]; confidence: number; reasoning?: string } | null {
  const obj = getMetadataObj(metadata);
  if (!obj) return null;
  const llmCat = obj.llm_category as Record<string, unknown> | undefined;
  if (!llmCat || !Array.isArray(llmCat.canonical_category)) return null;
  const confidence = typeof llmCat.confidence === "number" ? llmCat.confidence : 0;
  const reasoning = typeof llmCat.reasoning === "string" ? llmCat.reasoning : undefined;
  return { canonical_category: llmCat.canonical_category as string[], confidence, reasoning };
}

/** Check if LLM category differs from current canonical (taxonomy or previously applied LLM). */
function llmCategoryDiffers(row: { canonical_category?: string[] | null; metadata?: AdminListing["metadata"] }): boolean {
  const llm = getLLMCategory(row.metadata ?? undefined);
  if (!llm) return false;
  const curr = row.canonical_category ?? [];
  if (llm.canonical_category.length !== curr.length) return true;
  return llm.canonical_category.some((c, i) => c !== curr[i]);
}

/** Get all spec keys from metadata (specs + llm_specs + llm_overrides). */
function getAllSpecKeys(metadata: AdminListing["metadata"]): string[] {
  const obj = getMetadataObj(metadata);
  if (!obj) return [];
  const specs = obj.specs as Record<string, unknown> | undefined;
  const llmSpecs = obj.llm_specs as Record<string, unknown> | undefined;
  const overrides = obj.llm_overrides as Record<string, unknown> | undefined;
  const keys = new Set<string>([
    ...(specs && typeof specs === "object" ? Object.keys(specs) : []),
    ...(llmSpecs && typeof llmSpecs === "object" ? Object.keys(llmSpecs) : []),
    ...(overrides && typeof overrides === "object" ? Object.keys(overrides) : []),
  ]);
  return [...keys].sort();
}

function ListingSpecOverrides({
  listingId,
  metadata,
  mutation,
}: {
  listingId: number;
  metadata: AdminListing["metadata"];
  mutation: ReturnType<typeof useSetListingLLMOverrides>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const keys = getAllSpecKeys(metadata);
  if (keys.length === 0) return null;

  const overridesToSave: Record<string, string | null> = {};
  for (const key of keys) {
    const displayed = getDisplayedSpec(metadata, key) ?? "";
    const current = key in edits ? edits[key] : displayed;
    if (current !== displayed) {
      if (current === "" && hasOverride(metadata, key)) overridesToSave[key] = null;
      else if (current !== "") overridesToSave[key] = current;
    }
  }
  const hasChanges = Object.keys(overridesToSave).length > 0;

  function handleSave() {
    if (!hasChanges) return;
    mutation.mutate({ id: listingId, overrides: overridesToSave });
    setEdits({});
  }

  return (
    <div>
      <h4 className="font-medium text-stone-700 mb-2">Specifications (LLM overrides)</h4>
      <p className="text-xs text-stone-500 mb-2">
        Edit values to override LLM-extracted specs. Overridden values appear highlighted.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2">
        {keys.map((key) => {
          const displayed = getDisplayedSpec(metadata, key) ?? "";
          const value = key in edits ? edits[key] : displayed;
          const isOverridden = hasOverride(metadata, key);
          return (
            <span key={key} className="contents">
              <dt className="text-stone-500 flex items-center gap-1">
                {key.replace(/_/g, " ")}
                {isOverridden && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">override</span>
                )}
              </dt>
              <dd>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`w-full max-w-xs rounded border px-2 py-1 text-sm ${
                    isOverridden ? "border-blue-300 bg-blue-50" : "border-stone-300"
                  }`}
                  placeholder="—"
                />
              </dd>
            </span>
          );
        })}
      </dl>
      {hasChanges && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save overrides"}
          </button>
          <button
            type="button"
            onClick={() => setEdits({})}
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Reset
          </button>
        </div>
      )}
      <details className="mt-1">
        <summary className="text-stone-500 cursor-pointer text-xs">Raw metadata JSON</summary>
        <pre className="rounded bg-stone-100 p-2 text-xs overflow-auto max-h-24 mt-1">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function DataBrowser() {
  const [storeId, setStoreId] = useState<number>(0);
  const [brand, setBrand] = useState("");
  const [hasEnrichment, setHasEnrichment] = useState<boolean | null>(null);
  const [inStock, setInStock] = useState<boolean | null>(null);
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [llmConfidenceBelow, setLlmConfidenceBelow] = useState<number | null>(null);

  const { data: stores = [] } = useAdminStores();
  const { data: listingsData, isPending: loading, isError, error, refetch } = useAdminListings({
    store_id: storeId || undefined,
    brand: brand || undefined,
    has_enrichment: hasEnrichment ?? undefined,
    in_stock: inStock ?? undefined,
    hidden: visibility === "all" ? undefined : visibility === "hidden",
    category: category || undefined,
    llm_confidence_below: llmConfidenceBelow ?? undefined,
    q: q || undefined,
    sort,
    limit: PAGE_SIZE,
    offset,
  });

  const { data: detail } = useAdminListing(selectedId);
  const { data: priceHistory } = usePriceHistory(selectedId);

  const enrichMutation = useEnrichListing();
  const setHiddenMutation = useSetListingHidden();
  const setLLMOverridesMutation = useSetListingLLMOverrides();

  const listings = listingsData?.listings ?? [];
  const totalCount = listingsData?.total_count ?? 0;

  const chartData =
    priceHistory?.points.map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  function handleEnrich() {
    if (selectedId == null) return;
    enrichMutation.mutate(selectedId);
  }

  function handleSetHidden(hidden: boolean) {
    if (selectedId == null) return;
    setHiddenMutation.mutate({ id: selectedId, hidden });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Data</h2>

      {(isError || enrichMutation.isError || setHiddenMutation.isError || setLLMOverridesMutation.isError) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {enrichMutation.isError
            ? enrichMutation.error?.message ?? "Enrich failed"
            : setHiddenMutation.isError
              ? setHiddenMutation.error?.message ?? "Update failed"
              : setLLMOverridesMutation.isError
                ? setLLMOverridesMutation.error?.message ?? "Override failed"
                : error?.message ?? "Failed to load"}
          <button
            type="button"
            onClick={() => {
              enrichMutation.reset();
              setHiddenMutation.reset();
              setLLMOverridesMutation.reset();
              if (isError) refetch();
            }}
            className="ml-2 underline"
          >
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
        <select
          value={inStock === null ? "" : inStock ? "yes" : "no"}
          onChange={(e) => {
            const v = e.target.value;
            setInStock(v === "" ? null : v === "yes");
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="">Stock: any</option>
          <option value="yes">In stock</option>
          <option value="no">Out of stock</option>
        </select>
        <select
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value as "all" | "visible" | "hidden");
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="all">Visibility: all</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
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
          value={llmConfidenceBelow === null ? "" : String(llmConfidenceBelow)}
          onChange={(e) => {
            const v = e.target.value;
            setLlmConfidenceBelow(v === "" ? null : Number(v));
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="">LLM conf: any</option>
          <option value="0.9">&lt; 0.9</option>
          <option value="0.7">&lt; 0.7</option>
          <option value="0.5">&lt; 0.5</option>
        </select>
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
                    <th className="px-4 py-2 text-left font-medium text-stone-600 w-8" aria-label="Visibility" />
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Product</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Store</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Brand</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Price</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Discount %</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Canonical category</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">LLM Cat</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Metadata</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">MTB class</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Travel</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Wheel</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">LLM conf</th>
                    <th className="px-4 py-2 text-center font-medium text-stone-600">Stock</th>
                    <th className="px-4 py-2 text-center font-medium text-stone-600">Enriched</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Last scraped</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((row) => {
                    const diff = llmCategoryDiffers(row);
                    return (
                    <tr
                      key={row.id}
                      className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${row.hidden ? "opacity-60 bg-stone-50" : ""} ${diff ? "bg-amber-50" : ""}`}
                      onClick={() => setSelectedId(row.id)}
                      title={diff ? "LLM suggested a different category" : undefined}
                    >
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {row.hidden ? (
                          <span className="text-stone-400" title="Hidden from public feed">Hidden</span>
                        ) : (
                          <span className="text-stone-300" title="Visible">—</span>
                        )}
                      </td>
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
                      <td className="px-4 py-2 text-stone-600 max-w-xs truncate" title={getLLMCategory(row.metadata)?.reasoning}>
                        {getLLMCategory(row.metadata)
                          ? `${canonCatDisplay(getLLMCategory(row.metadata)!.canonical_category)} ${Math.round(getLLMCategory(row.metadata)!.confidence * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-[10rem] truncate" title={metadataSummary(row.metadata)}>
                        {metadataSummary(row.metadata)}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-20 truncate">
                        {getDisplayedSpec(row.metadata, "mtb_class") ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-20 truncate">
                        {[getDisplayedSpec(row.metadata, "front_travel_mm"), getDisplayedSpec(row.metadata, "rear_travel_mm")]
                          .filter(Boolean)
                          .join("/") || "—"}
                      </td>
                      <td className="px-4 py-2 text-stone-600 max-w-16 truncate">
                        {getDisplayedSpec(row.metadata, "wheel_size") ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-stone-600">
                        {getLLMConfidence(row.metadata) != null
                          ? `${Math.round(getLLMConfidence(row.metadata)! * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.is_in_stock ? (
                          <span className="text-green-600">In stock</span>
                        ) : (
                          <span className="text-amber-600 font-medium">Out of stock</span>
                        )}
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
                  );})}
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
                {detail && (
                  <button
                    type="button"
                    onClick={() => handleSetHidden(!detail.hidden)}
                    disabled={setHiddenMutation.isPending}
                    className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
                  >
                    {setHiddenMutation.isPending ? "…" : detail.hidden ? "Unhide" : "Hide"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={enrichMutation.isPending}
                  className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-50"
                >
                  {enrichMutation.isPending ? "Enriching…" : "Enrich"}
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
            {detail ? (
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  {detail.image_url ? (
                    <img
                      src={detail.image_url}
                      alt=""
                      className="h-32 w-32 shrink-0 rounded border border-stone-200 object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-800">{detail.product_name}</p>
                    {(detail.affiliate_url || detail.product_url) && (
                      <a
                        href={detail.affiliate_url || detail.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-stone-600 underline hover:text-stone-800"
                      >
                        View deal →
                      </a>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-stone-500">Store</dt>
                  <dd>{detail.store_name}</dd>
                  <dt className="text-stone-500">Visibility</dt>
                  <dd>
                    {detail.hidden ? (
                      <span className="text-amber-600 font-medium">Hidden (excluded from public feed)</span>
                    ) : (
                      <span className="text-green-600">Visible</span>
                    )}
                  </dd>
                  <dt className="text-stone-500">Stock status</dt>
                  <dd>
                    {detail.is_in_stock ? (
                      <span className="text-green-600">In stock</span>
                    ) : (
                      <span className="text-amber-600 font-medium">Out of stock</span>
                    )}
                  </dd>
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
                <ListingSpecOverrides
                  listingId={detail.id}
                  metadata={detail.metadata}
                  mutation={setLLMOverridesMutation}
                />
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
