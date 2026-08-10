"use client";

import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  useCanonicalCategoryPaths,
  useAdminCategoryTree,
  useCategoryProfileFields,
  useEnrichJob,
} from "./hooks/queries";
import {
  useEnrichListing,
  useRunListingLLMSpecs,
  useSetListingHidden,
  useSetListingHomeDemoted,
  useSetListingCategory,
  useSetListingLLMOverrides,
  usePostBulkListingsClassify,
  usePostBulkListingsEnrich,
  usePostBulkListingsLLMSpecs,
  usePostBulkListingsSetCategory,
  useCreateTaxonomyMapping,
} from "./hooks/mutations";
import type {
  AdminBulkListingsFilterBody,
  AdminCategoryTreeNode,
  AdminListing,
  AdminProfileField,
  TaxonomyMappingSuggestion,
} from "./api";
import { CategoryPicker } from "./CategoryPicker";
import { sanitizeForHtmlId } from "../lib/htmlId";
import { formatMoney } from "@/lib/formatMoney";

const PAGE_SIZE = 25;

/** Resolves admin tree path (root → leaf names) to the node's slug for GET /admin/listings?category_slug=. */
function adminCategorySlugForPath(
  nodes: AdminCategoryTreeNode[],
  path: string[],
  prefix: string[] = [],
): string | null {
  for (const n of nodes) {
    const full = [...prefix, n.name];
    if (
      full.length === path.length &&
      full.every((segment, i) => segment === path[i])
    ) {
      return n.slug;
    }
    if (n.children?.length) {
      const found = adminCategorySlugForPath(n.children, path, full);
      if (found) return found;
    }
  }
  return null;
}

/** Resolves admin tree path (root → leaf names) to category id. */
function adminCategoryIdForPath(
  nodes: AdminCategoryTreeNode[],
  path: string[],
  prefix: string[] = [],
): number | null {
  for (const n of nodes) {
    const full = [...prefix, n.name];
    if (
      full.length === path.length &&
      full.every((segment, i) => segment === path[i])
    ) {
      return n.id;
    }
    if (n.children?.length) {
      const found = adminCategoryIdForPath(n.children, path, full);
      if (found != null) return found;
    }
  }
  return null;
}

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

function specValueToString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

/** Get displayed spec value: llm_overrides[key] ?? llm_specs[key] ?? specs[key] (legacy). */
function getDisplayedSpec(metadata: AdminListing["metadata"], key: string): string {
  const obj = getMetadataObj(metadata);
  if (!obj) return "";
  const overrides = obj.llm_overrides as Record<string, unknown> | undefined;
  if (overrides && key in overrides) return specValueToString(overrides[key]);
  const llmSpecs = obj.llm_specs as Record<string, unknown> | undefined;
  if (llmSpecs && llmSpecs[key] != null) return specValueToString(llmSpecs[key]);
  const specs = obj.specs as Record<string, unknown> | undefined;
  if (specs && specs[key] != null) return specValueToString(specs[key]);
  return "";
}

function getDisplayedSpecMulti(
  metadata: AdminListing["metadata"],
  key: string,
): string[] {
  const obj = getMetadataObj(metadata);
  if (!obj) return [];
  const raw =
    (obj.llm_overrides as Record<string, unknown> | undefined)?.[key] ??
    (obj.llm_specs as Record<string, unknown> | undefined)?.[key] ??
    (obj.specs as Record<string, unknown> | undefined)?.[key];
  if (Array.isArray(raw)) return raw.map(String);
  if (raw == null || raw === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

function fieldLabel(field: AdminProfileField): string {
  return field.label?.trim() || field.key.replace(/_/g, " ");
}

function SpecFieldInput({
  field,
  metadata,
  edits,
  setEdits,
  termId,
}: {
  field: AdminProfileField;
  metadata: AdminListing["metadata"];
  edits: Record<string, string | string[]>;
  setEdits: Dispatch<SetStateAction<Record<string, string | string[]>>>;
  termId: string;
}) {
  const key = field.key;
  const isOverridden = hasOverride(metadata, key);
  const inputClass = `w-full max-w-xs rounded border px-2 py-1 text-sm ${
    isOverridden ? "border-blue-300 bg-blue-50" : "border-stone-300"
  }`;

  if (field.type === "enum" && field.values && field.values.length > 0) {
    const displayed = getDisplayedSpec(metadata, key);
    const value = key in edits ? String(edits[key]) : displayed;
    return (
      <select
        id={termId}
        value={value}
        onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
        aria-labelledby={termId}
        className={inputClass}
      >
        <option value="">—</option>
        {field.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi_enum" && field.values && field.values.length > 0) {
    const displayed = getDisplayedSpecMulti(metadata, key);
    const selected =
      key in edits && Array.isArray(edits[key])
        ? (edits[key] as string[])
        : displayed;
    return (
      <div className="flex flex-wrap gap-2 max-w-md" role="group" aria-labelledby={termId}>
        {field.values.map((v) => {
          const checked = selected.includes(v);
          return (
            <label
              key={v}
              className="inline-flex items-center gap-1 text-sm text-stone-700"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selected.filter((x) => x !== v)
                    : [...selected, v];
                  setEdits((prev) => ({ ...prev, [key]: next }));
                }}
                className="rounded border-stone-300"
              />
              {v}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === "integer" || field.type === "number") {
    const displayed = getDisplayedSpec(metadata, key);
    const value = key in edits ? String(edits[key]) : displayed;
    return (
      <input
        type="number"
        id={termId}
        value={value}
        onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
        aria-labelledby={termId}
        className={inputClass}
        placeholder="—"
      />
    );
  }

  const displayed = getDisplayedSpec(metadata, key);
  const value = key in edits ? String(edits[key]) : displayed;
  return (
    <input
      type="text"
      id={termId}
      value={value}
      onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
      aria-labelledby={termId}
      className={inputClass}
      placeholder="—"
    />
  );
}

function ListingSpecOverrides({
  listingId,
  metadata,
  categoryId,
  mutation,
}: {
  listingId: number;
  metadata: AdminListing["metadata"];
  categoryId: number | null | undefined;
  mutation: ReturnType<typeof useSetListingLLMOverrides>;
}) {
  const specTermPrefix = useId();
  const [edits, setEdits] = useState<Record<string, string | string[]>>({});
  const { data: profileFields = [] } = useCategoryProfileFields(categoryId);

  const profileKeys = new Set(profileFields.map((f) => f.key));
  const extraKeys = getAllSpecKeys(metadata).filter((k) => !profileKeys.has(k));
  const sortedProfileFields = [...profileFields].sort(
    (a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0),
  );
  const allKeys = [
    ...sortedProfileFields.map((f) => f.key),
    ...extraKeys,
  ];
  if (allKeys.length === 0) return null;

  const fieldByKey = new Map(profileFields.map((f) => [f.key, f]));

  const overridesToSave: Record<string, string | string[] | null> = {};
  for (const key of allKeys) {
    const field = fieldByKey.get(key);
    if (field?.type === "multi_enum") {
      const displayed = getDisplayedSpecMulti(metadata, key);
      const current =
        key in edits && Array.isArray(edits[key])
          ? (edits[key] as string[])
          : displayed;
      const same =
        current.length === displayed.length &&
        current.every((v, i) => v === displayed[i]);
      if (!same) {
        if (current.length === 0 && hasOverride(metadata, key)) {
          overridesToSave[key] = null;
        } else {
          overridesToSave[key] = current;
        }
      }
      continue;
    }
    const displayed = getDisplayedSpec(metadata, key);
    const current = key in edits ? String(edits[key]) : displayed;
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
        Edit values to override LLM-extracted specs. Profile fields use dropdowns when defined.
        Overridden values appear highlighted.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2">
        {sortedProfileFields.map((field) => {
          const key = field.key;
          const isOverridden = hasOverride(metadata, key);
          const termId = `${specTermPrefix}-${sanitizeForHtmlId(key)}`;
          return (
            <span key={key} className="contents">
              <dt id={termId} className="text-stone-500 flex items-center gap-1">
                {fieldLabel(field)}
                {isOverridden && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                    override
                  </span>
                )}
              </dt>
              <dd>
                <SpecFieldInput
                  field={field}
                  metadata={metadata}
                  edits={edits}
                  setEdits={setEdits}
                  termId={termId}
                />
              </dd>
            </span>
          );
        })}
        {extraKeys.map((key) => {
          const displayed = getDisplayedSpec(metadata, key);
          const value = key in edits ? String(edits[key]) : displayed;
          const isOverridden = hasOverride(metadata, key);
          const termId = `${specTermPrefix}-${sanitizeForHtmlId(key)}`;
          return (
            <span key={key} className="contents">
              <dt id={termId} className="text-stone-500 flex items-center gap-1">
                {key.replace(/_/g, " ")}
                <span className="text-xs text-stone-400">(extra)</span>
                {isOverridden && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                    override
                  </span>
                )}
              </dt>
              <dd>
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  aria-labelledby={termId}
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
  const listingsFilterPrefix = useId();
  const filterId = (suffix: string) => `${listingsFilterPrefix}-${suffix}`;
  const [storeId, setStoreId] = useState<number>(0);
  const [brand, setBrand] = useState("");
  const [hasEnrichment, setHasEnrichment] = useState<boolean | null>(null);
  const [inStock, setInStock] = useState<boolean | null>(null);
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [homeDemotedFilter, setHomeDemotedFilter] = useState<"all" | "eligible" | "demoted">("all");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [llmConfidenceBelow, setLlmConfidenceBelow] = useState<number | null>(null);
  const [canonicalPath, setCanonicalPath] = useState("");
  /** Path from CategoryPicker — maps to category_slug (subtree / same as public /deals). */
  const [pickedCategoryPath, setPickedCategoryPath] = useState<string[]>([]);
  const [bulkModal, setBulkModal] = useState<
    "classify" | "enrich" | "llm_specs" | "set_category" | null
  >(null);
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [bulkAllowEmptySpecs, setBulkAllowEmptySpecs] = useState(false);
  const [bulkSetCategoryPath, setBulkSetCategoryPath] = useState<string[]>([]);
  const [bulkJobId, setBulkJobId] = useState<number | null>(null);
  const [bulkFlash, setBulkFlash] = useState<string | null>(null);
  const [taxonomySuggestion, setTaxonomySuggestion] =
    useState<TaxonomyMappingSuggestion | null>(null);

  const { data: stores = [] } = useAdminStores();
  const { data: canonicalPaths = [] } = useCanonicalCategoryPaths();
  const { data: categoryTree = [] } = useAdminCategoryTree();

  const categorySlugFromPicker = useMemo(() => {
    if (pickedCategoryPath.length === 0) return undefined;
    return (
      adminCategorySlugForPath(categoryTree, pickedCategoryPath) ?? undefined
    );
  }, [categoryTree, pickedCategoryPath]);

  const { data: listingsData, isPending: loading, isError, error, refetch } = useAdminListings({
    store_id: storeId || undefined,
    brand: brand || undefined,
    has_enrichment: hasEnrichment ?? undefined,
    in_stock: inStock ?? undefined,
    hidden: visibility === "all" ? undefined : visibility === "hidden",
    home_demoted:
      homeDemotedFilter === "all"
        ? undefined
        : homeDemotedFilter === "demoted",
    category: category || undefined,
    category_slug: categorySlugFromPicker,
    canonical_category: categorySlugFromPicker
      ? undefined
      : canonicalPath || undefined,
    llm_confidence_below: llmConfidenceBelow ?? undefined,
    q: q || undefined,
    sort,
    limit: PAGE_SIZE,
    offset,
  });

  const { data: detail } = useAdminListing(selectedId);
  const { data: priceHistory } = usePriceHistory(selectedId);

  const enrichMutation = useEnrichListing();
  const listingLLMMutation = useRunListingLLMSpecs();
  const setHiddenMutation = useSetListingHidden();
  const setHomeDemotedMutation = useSetListingHomeDemoted();
  const setCategoryMutation = useSetListingCategory();

  useEffect(() => {
    setTaxonomySuggestion(null);
    setCategoryMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when switching listings only
  }, [selectedId]);
  const setLLMOverridesMutation = useSetListingLLMOverrides();
  const bulkClassifyMutation = usePostBulkListingsClassify();
  const bulkEnrichMutation = usePostBulkListingsEnrich();
  const { data: bulkJob, refetch: refetchBulkJob } = useEnrichJob(bulkJobId);

  const listings = listingsData?.listings ?? [];
  const totalCount = listingsData?.total_count ?? 0;

  useEffect(() => {
    if (!bulkJobId) return;
    if (bulkJob?.status && !["running"].includes(bulkJob.status)) return;
    const t = setInterval(() => {
      void refetchBulkJob();
    }, 2000);
    return () => clearInterval(t);
  }, [bulkJobId, bulkJob?.status, refetchBulkJob]);

  const bulkLLMSpecsMutation = usePostBulkListingsLLMSpecs();
  const bulkSetCategoryMutation = usePostBulkListingsSetCategory();
  const createTaxonomyMappingMutation = useCreateTaxonomyMapping();

  function buildBulkFilterBody(): AdminBulkListingsFilterBody {
    const body: AdminBulkListingsFilterBody = {
      store_id: storeId || undefined,
      brand: brand || undefined,
      has_enrichment: hasEnrichment ?? undefined,
      in_stock: inStock ?? undefined,
      hidden: visibility === "all" ? undefined : visibility === "hidden",
      category: category || undefined,
      category_slug: categorySlugFromPicker,
      canonical_category: categorySlugFromPicker
        ? undefined
        : canonicalPath || undefined,
      q: q || undefined,
      llm_confidence_below: llmConfidenceBelow ?? undefined,
    };
    if (bulkModal === "llm_specs" && bulkAllowEmptySpecs) {
      body.has_non_empty_specs = false;
    }
    return body;
  }

  const chartData =
    (priceHistory?.points ?? []).map((p) => ({
      ...p,
      dateLabel: formatAxisDate(p.recorded_at),
    })) ?? [];

  function handleEnrich() {
    if (selectedId == null) return;
    enrichMutation.mutate(selectedId);
  }

  function handleListingLLMSpecs() {
    if (selectedId == null) return;
    listingLLMMutation.mutate({ id: selectedId });
  }

  function handleSetHidden(hidden: boolean) {
    if (selectedId == null) return;
    setHiddenMutation.mutate({ id: selectedId, hidden });
  }

  function handleSetHomeDemoted(homeDemoted: boolean) {
    if (selectedId == null) return;
    setHomeDemotedMutation.mutate({ id: selectedId, homeDemoted });
  }

  function bulkConfirmPhrase(m: "classify" | "enrich" | "llm_specs" | "set_category") {
    if (m === "classify") return "reclassify";
    if (m === "enrich") return "re-enrich";
    if (m === "set_category") return "set-category";
    return "bulk-llm-specs";
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Data</h2>

      {(isError ||
        enrichMutation.isError ||
        listingLLMMutation.isError ||
        setHiddenMutation.isError ||
        setHomeDemotedMutation.isError ||
        setCategoryMutation.isError ||
        setLLMOverridesMutation.isError ||
        bulkClassifyMutation.isError ||
        bulkEnrichMutation.isError ||
        bulkLLMSpecsMutation.isError ||
        bulkSetCategoryMutation.isError ||
        createTaxonomyMappingMutation.isError) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {enrichMutation.isError
            ? enrichMutation.error?.message ?? "Enrich failed"
            : listingLLMMutation.isError
              ? listingLLMMutation.error?.message ?? "LLM specs failed"
              : setHiddenMutation.isError
              ? setHiddenMutation.error?.message ?? "Update failed"
              : setHomeDemotedMutation.isError
              ? setHomeDemotedMutation.error?.message ?? "Home demote update failed"
              : setCategoryMutation.isError
                ? setCategoryMutation.error?.message ?? "Category update failed"
              : setLLMOverridesMutation.isError
                ? setLLMOverridesMutation.error?.message ?? "Override failed"
                : bulkClassifyMutation.isError
                  ? bulkClassifyMutation.error?.message ?? "Bulk classify failed"
                  : bulkLLMSpecsMutation.isError
                    ? bulkLLMSpecsMutation.error?.message ?? "Bulk LLM specs failed"
                  : bulkEnrichMutation.isError
                    ? bulkEnrichMutation.error?.message ?? "Bulk enrich failed"
                    : bulkSetCategoryMutation.isError
                      ? bulkSetCategoryMutation.error?.message ??
                        "Bulk set category failed"
                      : createTaxonomyMappingMutation.isError
                        ? createTaxonomyMappingMutation.error?.message ??
                          "Create taxonomy rule failed"
                        : error?.message ?? "Failed to load"}
          <button
            type="button"
            onClick={() => {
              enrichMutation.reset();
              listingLLMMutation.reset();
              setHiddenMutation.reset();
              setCategoryMutation.reset();
              setLLMOverridesMutation.reset();
              bulkClassifyMutation.reset();
              bulkEnrichMutation.reset();
              bulkLLMSpecsMutation.reset();
              bulkSetCategoryMutation.reset();
              createTaxonomyMappingMutation.reset();
              if (isError) refetch();
            }}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor={filterId("search")} className="sr-only">
          Search listings
        </label>
        <input
          id={filterId("search")}
          type="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-48"
        />
        <label htmlFor={filterId("store")} className="sr-only">
          Store
        </label>
        <select
          id={filterId("store")}
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
        <label htmlFor={filterId("brand")} className="sr-only">
          Brand
        </label>
        <input
          id={filterId("brand")}
          type="text"
          placeholder="Brand"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-32"
        />
        <label htmlFor={filterId("enrichment")} className="sr-only">
          Enrichment
        </label>
        <select
          id={filterId("enrichment")}
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
        <label htmlFor={filterId("stock")} className="sr-only">
          Stock
        </label>
        <select
          id={filterId("stock")}
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
        <label htmlFor={filterId("visibility")} className="sr-only">
          Visibility
        </label>
        <select
          id={filterId("visibility")}
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
        <label htmlFor={filterId("home-demoted")} className="sr-only">
          Home page
        </label>
        <select
          id={filterId("home-demoted")}
          value={homeDemotedFilter}
          onChange={(e) => {
            setHomeDemotedFilter(e.target.value as "all" | "eligible" | "demoted");
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="all">Home: all</option>
          <option value="eligible">Home eligible</option>
          <option value="demoted">Home demoted</option>
        </select>
        <label htmlFor={filterId("category-contains")} className="sr-only">
          Category contains
        </label>
        <input
          id={filterId("category-contains")}
          type="text"
          placeholder="Category contains"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm w-40"
        />
        <div className="flex flex-col gap-1 max-w-[14rem]">
          <CategoryPicker
            id="data-browser-category-tree"
            label="Category (public)"
            placeholder="Subtree — matches site…"
            value={pickedCategoryPath}
            onChange={(path) => {
              setPickedCategoryPath(path);
              setOffset(0);
            }}
          />
          <p className="text-xs text-muted-foreground leading-snug">
            Subtree on category_id — same as the public deals page. Overrides the
            exact canonical path below when set.
          </p>
        </div>
        <label htmlFor={filterId("canonical-path")} className="sr-only">
          Canonical path exact match
        </label>
        <select
          id={filterId("canonical-path")}
          value={canonicalPath}
          onChange={(e) => {
            setCanonicalPath(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm max-w-[12rem]"
        >
          <option value="">Canonical path (exact): any</option>
          {canonicalPaths.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label htmlFor={filterId("llm-confidence")} className="sr-only">
          LLM confidence threshold
        </label>
        <select
          id={filterId("llm-confidence")}
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
        <label htmlFor={filterId("sort")} className="sr-only">
          Sort listings
        </label>
        <select
          id={filterId("sort")}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setOffset(0);
          }}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="newest">Newest scraped</option>
          <option value="last_enriched">Recently enriched</option>
          <option value="discount">Discount %</option>
          <option value="price_asc">Price (low)</option>
          <option value="price_desc">Price (high)</option>
          <option value="relevance">Relevance</option>
        </select>
      </div>

      {totalCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-stone-800">
          <span className="font-medium">Bulk (current filters):</span>
          <button
            type="button"
            onClick={() => {
              setBulkConfirmText("");
              setBulkAllowEmptySpecs(false);
              setBulkModal("classify");
            }}
            className="rounded bg-stone-800 px-3 py-1.5 text-white hover:bg-stone-700"
          >
            Re-classify all ({totalCount.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkConfirmText("");
              setBulkAllowEmptySpecs(false);
              setBulkModal("enrich");
            }}
            className="rounded border border-amber-800 bg-white px-3 py-1.5 text-amber-950 hover:bg-amber-100"
          >
            Re-enrich all ({totalCount.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkConfirmText("");
              setBulkAllowEmptySpecs(false);
              setBulkModal("llm_specs");
            }}
            className="rounded border border-stone-600 bg-white px-3 py-1.5 text-stone-800 hover:bg-stone-50"
          >
            LLM specs (no PDP) ({totalCount.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkConfirmText("");
              setBulkSetCategoryPath([]);
              setBulkModal("set_category");
            }}
            className="rounded border border-violet-600 bg-white px-3 py-1.5 text-violet-900 hover:bg-violet-50"
          >
            Set category ({totalCount.toLocaleString()})
          </button>
          {bulkJobId && bulkJob && (
            <span className="text-stone-600">
              Job #{bulkJobId}{" "}
              {bulkJob.status === "running" || bulkJob.status === "completed" ? `— ${bulkJob.status}` : bulkJob.status}
              {typeof bulkJob.listings_processed === "number" && bulkJob.status === "completed" && (
                <span> ({bulkJob.listings_processed} processed)</span>
              )}
            </span>
          )}
        </div>
      )}
      {bulkFlash && (
        <p className="mb-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2 max-w-3xl">
          {bulkFlash}
          <button
            type="button"
            className="ml-2 underline text-stone-600"
            onClick={() => setBulkFlash(null)}
          >
            Dismiss
          </button>
        </p>
      )}

      {bulkModal && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
            <h3 className="font-medium text-stone-900">
              {bulkModal === "classify"
                ? "Re-classify all matching"
                : bulkModal === "enrich"
                  ? "Re-enrich all matching"
                  : bulkModal === "set_category"
                    ? "Set category for all matching"
                    : "LLM specs — all matching"}
            </h3>
            <p className="text-sm text-stone-600">
              This will affect up to {totalCount.toLocaleString()} listing
              {totalCount === 1 ? "" : "s"} (same filters as the table).{" "}
              {bulkModal === "enrich"
                ? "Re-enrich scrapes each PDP; it is slower and heavier than re-classify."
                : bulkModal === "set_category"
                  ? "Assigns the selected canonical category to every listing in the current filter. Manual overrides are not re-classified by LLM."
                  : bulkModal === "llm_specs"
                  ? "Runs LLM category + prompt extraction using data already stored (no PDP fetch). Defaults to listings that have scraped specs."
                  : ""}
            </p>
            {bulkModal === "set_category" && (
              <CategoryPicker
                id="bulk-set-category-picker"
                label="Canonical category"
                placeholder="Select category for all matching listings…"
                value={bulkSetCategoryPath}
                onChange={setBulkSetCategoryPath}
              />
            )}
            {bulkModal === "llm_specs" && (
              <label className="flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={bulkAllowEmptySpecs}
                  onChange={(e) => setBulkAllowEmptySpecs(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300"
                />
                Include listings without scraped specs (uses product name/description only — usually weaker)
              </label>
            )}
            {totalCount > 1000 && (
              <div>
                <label htmlFor={filterId("bulk-confirm")} className="block text-sm text-stone-700 mb-1">
                  Type{" "}
                  <strong className="font-mono">{bulkConfirmPhrase(bulkModal)}</strong> to confirm
                </label>
                <input
                  id={filterId("bulk-confirm")}
                  type="text"
                  className="w-full rounded border border-stone-300 px-2 py-1.5"
                  value={bulkConfirmText}
                  onChange={(e) => setBulkConfirmText(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded border border-stone-300 px-3 py-1.5 text-sm"
                onClick={() => setBulkModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={
                  bulkClassifyMutation.isPending ||
                  bulkEnrichMutation.isPending ||
                  bulkLLMSpecsMutation.isPending ||
                  bulkSetCategoryMutation.isPending ||
                  (bulkModal === "set_category" &&
                    adminCategoryIdForPath(categoryTree, bulkSetCategoryPath) ==
                      null) ||
                  (totalCount > 1000 &&
                    bulkConfirmText.trim() !== bulkConfirmPhrase(bulkModal))
                }
                onClick={async () => {
                  const body = buildBulkFilterBody();
                  try {
                    if (bulkModal === "set_category") {
                      const cid = adminCategoryIdForPath(
                        categoryTree,
                        bulkSetCategoryPath,
                      );
                      if (cid == null) return;
                      const r = await bulkSetCategoryMutation.mutateAsync({
                        ...body,
                        category_id: cid,
                      });
                      setBulkFlash(
                        `Updated category on ${r.updated.toLocaleString()} of ${r.total.toLocaleString()} listing${r.total === 1 ? "" : "s"}.`,
                      );
                      setBulkModal(null);
                      void refetch();
                    } else if (bulkModal === "classify") {
                      const r = await bulkClassifyMutation.mutateAsync(body);
                      setBulkJobId(r.job_id);
                      if (r.async) {
                        setBulkFlash(
                          r.message ??
                            `Job #${r.job_id} is running in the background (avoids a ~30s dev proxy timeout on long runs).`,
                        );
                      } else {
                        setBulkFlash(null);
                      }
                    } else if (bulkModal === "enrich") {
                      const r = await bulkEnrichMutation.mutateAsync(body);
                      setBulkJobId(r.job_id);
                      if (r.async) {
                        setBulkFlash(
                          r.message ??
                            `Job #${r.job_id} is running in the background (avoids a ~30s dev proxy timeout on long runs).`,
                        );
                      } else {
                        setBulkFlash(null);
                      }
                    } else {
                      const r = await bulkLLMSpecsMutation.mutateAsync(body);
                      setBulkJobId(r.job_id);
                      if (r.async) {
                        setBulkFlash(
                          r.message ??
                            `Job #${r.job_id} is running in the background (avoids a ~30s dev proxy timeout on long runs).`,
                        );
                      } else {
                        setBulkFlash(null);
                      }
                    }
                    setBulkModal(null);
                    void refetch();
                  } catch {
                    /* mutation surfaces error */
                  }
                }}
              >
                {bulkClassifyMutation.isPending ||
                bulkEnrichMutation.isPending ||
                bulkLLMSpecsMutation.isPending ||
                bulkSetCategoryMutation.isPending
                  ? "Running…"
                  : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Last enriched</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Last scraped</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((row) => {
                    const diff = llmCategoryDiffers(row);
                    return (
                    <tr
                      key={row.id}
                      className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${row.hidden ? "opacity-60 bg-stone-50" : ""} ${row.home_demoted ? "bg-violet-50/60" : ""} ${diff ? "bg-amber-50" : ""}`}
                      onClick={() => setSelectedId(row.id)}
                      title={diff ? "LLM suggested a different category" : undefined}
                    >
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {row.hidden ? (
                          <span className="text-stone-400" title="Hidden from public feed">Hidden</span>
                        ) : row.home_demoted ? (
                          <span className="text-violet-600" title="Demoted from home page top deals">Home−</span>
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
                      <td className="px-4 py-2 text-stone-600 whitespace-nowrap">
                        {row.last_enriched_at ? formatDate(row.last_enriched_at) : "—"}
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
                  <>
                    <button
                      type="button"
                      onClick={() => handleSetHomeDemoted(!detail.home_demoted)}
                      disabled={setHomeDemotedMutation.isPending}
                      className="rounded border border-violet-300 px-3 py-1.5 text-sm text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                      title="Exclude from or restore to home page top-deal sections"
                    >
                      {setHomeDemotedMutation.isPending
                        ? "…"
                        : detail.home_demoted
                          ? "Restore to home"
                          : "Demote from home"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetHidden(!detail.hidden)}
                      disabled={setHiddenMutation.isPending}
                      className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
                    >
                      {setHiddenMutation.isPending ? "…" : detail.hidden ? "Unhide" : "Hide"}
                    </button>
                  </>
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
                  onClick={handleListingLLMSpecs}
                  disabled={listingLLMMutation.isPending}
                  title="Re-run LLM category + specs from stored data (no PDP scrape)"
                  className="rounded border border-violet-400 bg-white px-3 py-1.5 text-sm text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                >
                  {listingLLMMutation.isPending ? "LLM…" : "LLM specs"}
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
                    ) : detail.home_demoted ? (
                      <span className="text-violet-700 font-medium">Demoted from home page top deals</span>
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
                  <dd className="max-w-sm">
                    <CategoryPicker
                      id="listing-detail-category"
                      label=""
                      placeholder="Select category…"
                      value={detail.canonical_category ?? []}
                      onChange={(path) => {
                        setTaxonomySuggestion(null);
                        const cid = adminCategoryIdForPath(categoryTree, path);
                        if (cid != null) {
                          setCategoryMutation.mutate(
                            { id: detail.id, categoryId: cid },
                            {
                              onSuccess: (data) => {
                                setTaxonomySuggestion(
                                  data.suggested_mapping ?? null,
                                );
                              },
                            },
                          );
                        }
                      }}
                    />
                    {setCategoryMutation.isPending && (
                      <p className="text-xs text-stone-500 mt-1">Saving category…</p>
                    )}
                    {setCategoryMutation.isSuccess &&
                      (setCategoryMutation.data?.siblings_updated ?? 0) > 0 && (
                        <p className="text-xs text-green-700 mt-1">
                          Also updated{" "}
                          {setCategoryMutation.data!.siblings_updated} variant
                          {setCategoryMutation.data!.siblings_updated === 1
                            ? ""
                            : "s"}{" "}
                          in the same product group.
                        </p>
                      )}
                    {taxonomySuggestion && (
                      <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-stone-800">
                        <p className="mb-2">{taxonomySuggestion.reason}</p>
                        <p className="text-xs text-stone-600 mb-2">
                          Create a taxonomy rule so future listings with similar store
                          breadcrumbs map to{" "}
                          <strong>
                            {taxonomySuggestion.canonical.join(" > ")}
                          </strong>
                          ?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={createTaxonomyMappingMutation.isPending}
                            className="rounded bg-stone-700 px-2 py-1 text-xs text-white hover:bg-stone-600 disabled:opacity-50"
                            onClick={() => {
                              createTaxonomyMappingMutation.mutate(
                                {
                                  raw_keywords: taxonomySuggestion.raw_keywords,
                                  canonical: taxonomySuggestion.canonical,
                                  priority: 100,
                                },
                                {
                                  onSuccess: () => {
                                    setTaxonomySuggestion(null);
                                  },
                                },
                              );
                            }}
                          >
                            {createTaxonomyMappingMutation.isPending
                              ? "Creating…"
                              : "Create rule"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-white"
                            onClick={() => setTaxonomySuggestion(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </dd>
                  <dt className="text-stone-500">LLM confidence</dt>
                  <dd>
                    {getLLMConfidence(detail.metadata) != null ? (
                      <span className={getLLMConfidence(detail.metadata)! < 0.7 ? "text-amber-600 font-medium" : ""}>
                        {(getLLMConfidence(detail.metadata)! * 100).toFixed(0)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </dl>
                {(() => {
                  const obj = getMetadataObj(detail.metadata);
                  const llmSpecs = obj?.llm_specs as Record<string, unknown> | undefined;
                  const specs = obj?.specs as Record<string, unknown> | undefined;
                  const hasLlm = llmSpecs && typeof llmSpecs === "object" && Object.keys(llmSpecs).length > 0;
                  const hasScraped = specs && typeof specs === "object" && Object.keys(specs).length > 0;
                  if (!hasLlm && !hasScraped) return null;
                  return (
                    <div className="space-y-3">
                      {hasLlm && (
                        <div>
                          <h4 className="font-medium text-stone-700 mb-1">LLM specs</h4>
                          <p className="text-xs text-stone-500 mb-2">LLM-extracted specs (used for filters)</p>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                            {Object.entries(llmSpecs).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                              <span key={k} className="contents">
                                <dt className="text-stone-500">{k.replace(/_/g, " ")}</dt>
                                <dd>{v != null ? String(v) : "—"}</dd>
                              </span>
                            ))}
                          </dl>
                        </div>
                      )}
                      {hasScraped && (
                        <div>
                          <h4 className="font-medium text-stone-700 mb-1">Scraped specs</h4>
                          <p className="text-xs text-stone-500 mb-2">Raw specs from PDP enrichment</p>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                            {Object.entries(specs).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                              <span key={k} className="contents">
                                <dt className="text-stone-500">{k.replace(/_/g, " ")}</dt>
                                <dd>{v != null ? String(v) : "—"}</dd>
                              </span>
                            ))}
                          </dl>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <ListingSpecOverrides
                  listingId={detail.id}
                  metadata={detail.metadata}
                  categoryId={detail.category_id}
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
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `$${formatMoney(v)}`}
                          />
                          <Tooltip formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, "Price"]} labelFormatter={(l) => l} />
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
