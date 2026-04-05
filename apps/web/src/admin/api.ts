import { getApiBase } from "@/lib/api";

const ADMIN_TOKEN_KEY = "adminPassword";

export function getStoredAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setStoredAdminToken(password: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, password);
}

export function clearStoredAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/** Headers for admin API calls (Bearer token from localStorage). */
export function adminHeaders(): HeadersInit {
  const token = getStoredAdminToken();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** Validate password; returns true if valid. Caller should store token on success. */
export async function adminAuth(password: string): Promise<boolean> {
  const res = await fetch(`${getApiBase()}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password.trim() }),
  });
  return res.ok;
}

export interface DashboardStats {
  total_stores: number;
  total_listings: number;
  in_stock_listings: number;
  enriched_listings: number;
}

export interface DashboardStore {
  id: number;
  name: string;
  store_type: string;
  deal_count: number;
  last_scraped: string;
  last_scrape_result_count?: number | null;
}

export interface DashboardResponse {
  stats: DashboardStats;
  stores: DashboardStore[];
  scraper_reachable: boolean;
  enrichment_pct: number;
  store_types_with_enrichers?: string[];
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${getApiBase()}/admin/dashboard`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch dashboard");
  return res.json();
}

/** Trigger scrape; pass store type (e.g. "worldwidecyclery") to scrape one store, or omit for all. */
export async function triggerScrape(store?: string): Promise<void> {
  const url = store ? `${getApiBase()}/scrape-now?store=${encodeURIComponent(store)}` : `${getApiBase()}/scrape-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error("Scrape request failed");
}

/** Trigger enrichment; pass force=true to re-enrich all, or store=store_type to enrich one store. */
export async function triggerEnrich(force?: boolean, store?: string): Promise<void> {
  const params = new URLSearchParams();
  if (force) params.set("force", "1");
  if (store) params.set("store", store);
  const qs = params.toString();
  const url = qs ? `${getApiBase()}/enrich-now?${qs}` : `${getApiBase()}/enrich-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error("Enrich request failed");
}

// --- Store management (Phase C) ---

export interface AdminStore {
  id: number;
  name: string;
  base_url: string;
  scrape_url: string;
  store_type: string;
  affiliate_network?: string | null;
  last_scrape_result_count?: number | null;
  deal_count: number;
}

export async function fetchAdminStores(): Promise<AdminStore[]> {
  const res = await fetch(`${getApiBase()}/admin/stores`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch stores");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchStoreTypes(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/admin/store-types`, { headers: adminHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store types");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Store types that support PDP enrichment (for showing Enrich button). */
export async function fetchStoreTypesWithEnrichers(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/admin/store-types-with-enrichers`, { headers: adminHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store types with enrichers");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminStore(id: number): Promise<AdminStore | null> {
  const res = await fetch(`${getApiBase()}/admin/stores/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch store");
  return res.json();
}

export interface StoreFormBody {
  name: string;
  base_url: string;
  scrape_url: string;
  store_type: string;
  affiliate_network?: string | null;
}

export async function createStore(body: StoreFormBody): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/stores`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateStore(id: number, body: StoreFormBody): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/stores/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteStore(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/stores/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

// --- Categories (structured category tree) ---

export interface AdminCategoryTreeNode {
  id: number;
  slug: string;
  name: string;
  parent_id: number | null;
  sort_order: number;
  depth: number;
  /** Present on GET /categories/tree (subtree listing rollup). */
  deal_count?: number;
  children: AdminCategoryTreeNode[];
}

export async function fetchAdminCategoryTree(): Promise<AdminCategoryTreeNode[]> {
  const res = await fetch(`${getApiBase()}/admin/categories`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch categories");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface CreateCategoryBody {
  slug: string;
  name: string;
  parent_id?: number | null;
  sort_order?: number;
}

export async function createAdminCategory(body: CreateCategoryBody): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/categories`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      slug: body.slug,
      name: body.name,
      parent_id: body.parent_id ?? null,
      sort_order: body.sort_order ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export interface UpdateCategoryBody {
  slug: string;
  name: string;
  sort_order?: number;
}

export async function updateAdminCategory(id: number, body: UpdateCategoryBody): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/categories/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      slug: body.slug,
      name: body.name,
      sort_order: body.sort_order ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteAdminCategory(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/categories/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Delete failed");
  }
}

// --- Scrape jobs (Phase D) ---

export interface ScrapeJob {
  id: number;
  store_id?: number | null;
  store_name: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  listings_found?: number | null;
  listings_upserted?: number | null;
  errors?: string[];
  warnings?: string[];
  triggered_by: string;
}

export async function fetchScrapeJobs(params?: {
  limit?: number;
  offset?: number;
  store_id?: number;
}): Promise<ScrapeJob[]> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.store_id != null) search.set("store_id", String(params.store_id));
  const qs = search.toString();
  const res = await fetch(`${getApiBase()}/admin/jobs${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch jobs");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchScrapeJob(id: number): Promise<ScrapeJob | null> {
  const res = await fetch(`${getApiBase()}/admin/jobs/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export async function cancelScrapeJob(id: number): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch(`${getApiBase()}/admin/jobs/${id}/cancel`, {
    method: "POST",
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Cancel failed";
    throw new Error(msg);
  }
  return data;
}

// --- Enrich jobs ---

export interface EnrichJob {
  id: number;
  store_type?: string | null;
  status: string;
  started_at: string;
  completed_at?: string | null;
  listings_processed?: number | null;
  listings_enriched?: number | null;
  errors?: string[];
  triggered_by: string;
  force_mode: boolean;
}

export async function fetchEnrichJobs(params?: {
  limit?: number;
  offset?: number;
}): Promise<EnrichJob[]> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`${getApiBase()}/admin/enrich-jobs${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch enrich jobs");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchEnrichJob(id: number): Promise<EnrichJob | null> {
  const res = await fetch(`${getApiBase()}/admin/enrich-jobs/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch enrich job");
  return res.json();
}

export async function cancelEnrichJob(id: number): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch(`${getApiBase()}/admin/enrich-jobs/${id}/cancel`, {
    method: "POST",
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Cancel failed";
    throw new Error(msg);
  }
  return data;
}

// --- Admin listings / data browser (Phase E) ---

export interface AdminListing {
  id: number;
  store_id: number;
  store_name: string;
  store_sku: string;
  product_name: string;
  current_price: number;
  original_price?: number | null;
  product_url: string;
  affiliate_url?: string | null;
  image_url?: string | null;
  brand?: string | null;
  category_path?: string[];
  canonical_category?: string[];
  category_id?: number | null;
  category_name?: string;
  metadata?: Record<string, unknown>;
  is_in_stock: boolean;
  hidden?: boolean;
  discount_pct?: number | null;
  last_scraped: string;
  created_at?: string;
  last_enriched_at?: string;
}

export interface AdminListingsResponse {
  listings: AdminListing[];
  total_count: number;
}

export async function fetchAdminListings(params?: {
  store_id?: number;
  brand?: string;
  has_canonical_category?: boolean;
  has_enrichment?: boolean;
  in_stock?: boolean;
  hidden?: boolean;
  category?: string;
  canonical_category?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  llm_confidence_below?: number;
}): Promise<AdminListingsResponse> {
  const search = new URLSearchParams();
  if (params?.store_id != null) search.set("store_id", String(params.store_id));
  if (params?.brand) search.set("brand", params.brand);
  if (params?.has_canonical_category != null) search.set("has_canonical_category", params.has_canonical_category ? "true" : "false");
  if (params?.has_enrichment != null) search.set("has_enrichment", params.has_enrichment ? "true" : "false");
  if (params?.in_stock != null) search.set("in_stock", params.in_stock ? "true" : "false");
  if (params?.hidden != null) search.set("hidden", params.hidden ? "true" : "false");
  if (params?.category) search.set("category", params.category);
  if (params?.canonical_category) search.set("canonical_category", params.canonical_category);
  if (params?.llm_confidence_below != null) search.set("llm_confidence_below", String(params.llm_confidence_below));
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`${getApiBase()}/admin/listings${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch listings");
  const data = await res.json();
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export async function fetchAdminListing(id: number): Promise<AdminListing | null> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch listing");
  return res.json();
}

/** Set hidden flag for a listing. Hidden listings are excluded from the public deals feed. */
export async function setListingHidden(id: number, hidden: boolean): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ hidden }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : res.status === 404 ? "Listing not found" : "Update failed";
    throw new Error(msg);
  }
}

/** Set LLM overrides for a listing. Body is the overrides map e.g. { mtb_class: "Trail" }. Pass null for a key to clear. */
export async function setListingLLMOverrides(id: number, overrides: Record<string, string | null>): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}/llm-overrides`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(overrides),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Update failed";
    throw new Error(msg);
  }
}

/** Re-run LLM extraction for all listings in a canonical category. */
export async function runLLMExtractionForCategory(canonicalCategory: string[]): Promise<{ ok: boolean; processed: number }> {
  const res = await fetch(`${getApiBase()}/admin/llm/run`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ canonical_category: canonicalCategory }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Re-run failed";
    throw new Error(msg);
  }
  return data;
}

/** Run enrichment for a single listing. Returns { ok, category_path } or throws with error message. */
export async function enrichListing(id: number): Promise<{ ok: boolean; category_path: string[] }> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}/enrich`, {
    method: "POST",
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Enrich failed";
    throw new Error(msg);
  }
  return data;
}

// --- Category taxonomy (canonical mappings) ---

export interface CategoryMapping {
  id: number;
  raw_keywords: string[];
  canonical: string[];
  priority: number;
  created_at: string;
  updated_at: string;
}

export async function fetchTaxonomyMappings(): Promise<CategoryMapping[]> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch taxonomy");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createTaxonomyMapping(body: {
  raw_keywords: string[];
  canonical: string[];
  priority?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      raw_keywords: body.raw_keywords,
      canonical: body.canonical,
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateTaxonomyMapping(
  id: number,
  body: { raw_keywords: string[]; canonical: string[]; priority?: number }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      raw_keywords: body.raw_keywords,
      canonical: body.canonical,
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteTaxonomyMapping(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function reorderTaxonomyMappings(
  updates: { id: number; priority: number }[]
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy/reorder`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Reorder failed");
  }
}

export async function triggerRecategorize(): Promise<{ updated: number }> {
  const res = await fetch(`${getApiBase()}/admin/taxonomy/recategorize`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Recategorize failed");
  return res.json();
}

// --- Spec filter config ---

export interface SpecFilterConfig {
  id: number;
  spec_key: string;
  visible: boolean;
  merge_into?: string | null;
  display_label?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SpecValueAlias {
  id: number;
  spec_key: string;
  raw_value: string;
  display_value: string;
  created_at: string;
}

export interface DiscoveredSpecKey {
  spec_key: string;
  product_count: number;
}

export async function fetchSpecFilterConfigs(): Promise<SpecFilterConfig[]> {
  const res = await fetch(`${getApiBase()}/admin/spec-filter-config`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch spec filter config");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createSpecFilterConfig(body: {
  spec_key: string;
  visible?: boolean;
  merge_into?: string | null;
  display_label?: string | null;
  sort_order?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/spec-filter-config`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      spec_key: body.spec_key,
      visible: body.visible ?? true,
      merge_into: body.merge_into ?? null,
      display_label: body.display_label ?? null,
      sort_order: body.sort_order ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateSpecFilterConfig(
  id: number,
  body: {
    spec_key: string;
    visible?: boolean;
    merge_into?: string | null;
    display_label?: string | null;
    sort_order?: number;
  }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/spec-filter-config/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      spec_key: body.spec_key,
      visible: body.visible ?? true,
      merge_into: body.merge_into ?? null,
      display_label: body.display_label ?? null,
      sort_order: body.sort_order ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteSpecFilterConfig(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/spec-filter-config/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function fetchSpecValueAliases(specKey?: string): Promise<SpecValueAlias[]> {
  const search = specKey ? `?spec_key=${encodeURIComponent(specKey)}` : "";
  const res = await fetch(`${getApiBase()}/admin/spec-value-aliases${search}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch spec value aliases");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createSpecValueAlias(body: {
  spec_key: string;
  raw_value: string;
  display_value: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/spec-value-aliases`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateSpecValueAlias(
  id: number,
  body: { spec_key: string; raw_value: string; display_value: string }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/spec-value-aliases/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteSpecValueAlias(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/spec-value-aliases/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function fetchSpecKeys(): Promise<DiscoveredSpecKey[]> {
  const res = await fetch(`${getApiBase()}/admin/spec-keys`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch spec keys");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function triggerRenormalizeSpecs(): Promise<{ updated: number }> {
  const res = await fetch(`${getApiBase()}/admin/renormalize-specs`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Renormalize specs failed");
  return res.json();
}

// --- Normalization (spec key aliases, value rules, unmapped dashboard) ---

export interface UnmappedCategoryPath {
  category_path: string;
  count: number;
}

export interface UnmappedItemsResponse {
  uncategorized_count: number;
  unmapped_category_paths: UnmappedCategoryPath[];
}

export async function fetchUnmappedItems(limit?: number): Promise<UnmappedItemsResponse> {
  const params = limit != null ? `?limit=${limit}` : "";
  const res = await fetch(`${getApiBase()}/admin/normalization/unmapped${params}`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch unmapped items");
  return res.json();
}

export interface SpecNormalizationRule {
  id: number;
  spec_key: string;
  rule_type: string;
  config: Record<string, unknown>;
  priority: number;
  created_at: string;
  updated_at: string;
}

export async function fetchSpecNormalizationRules(): Promise<SpecNormalizationRule[]> {
  const res = await fetch(`${getApiBase()}/admin/normalization/rules`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch normalization rules");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createSpecNormalizationRule(body: {
  spec_key: string;
  rule_type: string;
  config?: Record<string, unknown>;
  priority?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/normalization/rules`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      spec_key: body.spec_key,
      rule_type: body.rule_type,
      config: body.config ?? {},
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateSpecNormalizationRule(
  id: number,
  body: { spec_key: string; rule_type: string; config?: Record<string, unknown>; priority?: number }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/normalization/rules/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      spec_key: body.spec_key,
      rule_type: body.rule_type,
      config: body.config ?? {},
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) throw new Error("Update failed");
}

export async function deleteSpecNormalizationRule(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/normalization/rules/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export interface SpecKeyAlias {
  id: number;
  raw_substr: string;
  canonical_key: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export async function fetchSpecKeyAliases(): Promise<SpecKeyAlias[]> {
  const res = await fetch(`${getApiBase()}/admin/normalization/key-aliases`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch spec key aliases");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createSpecKeyAlias(body: {
  raw_substr: string;
  canonical_key: string;
  priority?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/normalization/key-aliases`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      raw_substr: body.raw_substr,
      canonical_key: body.canonical_key,
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateSpecKeyAlias(
  id: number,
  body: { raw_substr: string; canonical_key: string; priority?: number }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/normalization/key-aliases/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      raw_substr: body.raw_substr,
      canonical_key: body.canonical_key,
      priority: body.priority ?? 0,
    }),
  });
  if (!res.ok) throw new Error("Update failed");
}

export async function deleteSpecKeyAlias(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/normalization/key-aliases/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

// --- LLM Prompt Profiles ---

/** One composition row returned from GET /admin/llm-profiles/:id when the profile uses the field library. */
export interface LLMProfileFieldRow {
  id: number;
  field_def_id?: number | null;
  field_key?: string | null;
  sort_order: number;
  overrides: Record<string, unknown>;
  inline_field?: Record<string, unknown>;
}

/** Payload row for PUT with profile_fields (replaces all rows). */
export interface LLMProfileFieldInput {
  field_def_id?: number | null;
  sort_order: number;
  overrides?: Record<string, unknown>;
  inline_field?: Record<string, unknown> | null;
}

export interface LLMPromptProfile {
  id: number;
  canonical_category: string[];
  name: string;
  system_prompt: string;
  extraction_schema: Record<string, unknown>;
  enabled: boolean;
  /** Present on GET detail when the profile has llm_prompt_profile_fields rows. */
  profile_fields?: LLMProfileFieldRow[];
}

// --- LLM extraction field library (migration 019) ---

export interface LLMExtractionFieldDef {
  id: number;
  field_key: string;
  field_type: string;
  description: string;
  label?: string | null;
  values?: unknown;
  filterable?: boolean | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLLMExtractionFieldDefs(q?: string): Promise<LLMExtractionFieldDef[]> {
  // Do not use `new URL(relativePath)` — it throws without a base; getApiBase() is often `/api` (relative).
  let url = `${getApiBase().replace(/\/$/, "")}/admin/llm-extraction-field-defs`;
  if (q?.trim()) {
    url += `?${new URLSearchParams({ q: q.trim() })}`;
  }
  const res = await fetch(url, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch field definitions");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchLLMExtractionFieldDef(id: number): Promise<LLMExtractionFieldDef> {
  const res = await fetch(`${getApiBase()}/admin/llm-extraction-field-defs/${id}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error("Failed to fetch field definition");
  return res.json();
}

export async function createLLMExtractionFieldDef(body: {
  field_key: string;
  field_type: string;
  description: string;
  label?: string | null;
  values?: unknown;
  filterable?: boolean | null;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/llm-extraction-field-defs`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      field_key: body.field_key,
      field_type: body.field_type,
      description: body.description,
      label: body.label ?? null,
      values: body.values ?? null,
      filterable: body.filterable ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateLLMExtractionFieldDef(
  id: number,
  body: {
    field_key: string;
    field_type: string;
    description: string;
    label?: string | null;
    values?: unknown;
    filterable?: boolean | null;
  }
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/llm-extraction-field-defs/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      field_key: body.field_key,
      field_type: body.field_type,
      description: body.description,
      label: body.label ?? null,
      values: body.values ?? null,
      filterable: body.filterable ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteLLMExtractionFieldDef(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/llm-extraction-field-defs/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Delete failed");
  }
}

export async function fetchLLMProfiles(): Promise<LLMPromptProfile[]> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch LLM profiles");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchLLMProfile(id: number): Promise<LLMPromptProfile> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles/${id}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch profile");
  return res.json();
}

export async function createLLMProfile(body: {
  canonical_category: string[];
  name: string;
  system_prompt: string;
  extraction_schema: Record<string, unknown>;
  enabled?: boolean;
}): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      canonical_category: body.canonical_category,
      name: body.name,
      system_prompt: body.system_prompt,
      extraction_schema: body.extraction_schema,
      enabled: body.enabled ?? true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Create failed");
  }
  return res.json();
}

export async function updateLLMProfile(
  id: number,
  body: {
    canonical_category?: string[];
    name?: string;
    system_prompt?: string;
    extraction_schema?: Record<string, unknown>;
    /** When set, replaces all composition rows and hydrates extraction_schema. Omit extraction_schema in the same request. */
    profile_fields?: LLMProfileFieldInput[];
    enabled?: boolean;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.canonical_category !== undefined) payload.canonical_category = body.canonical_category;
  if (body.name !== undefined) payload.name = body.name;
  if (body.system_prompt !== undefined) payload.system_prompt = body.system_prompt;
  if (body.enabled !== undefined) payload.enabled = body.enabled;
  if (body.extraction_schema !== undefined) payload.extraction_schema = body.extraction_schema;
  if (body.profile_fields !== undefined) payload.profile_fields = body.profile_fields;
  const res = await fetch(`${getApiBase()}/admin/llm-profiles/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteLLMProfile(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function testLLMProfile(profileId: number, listingId: number): Promise<{ result: Record<string, unknown> | null; message?: string }> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles/${profileId}/test`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ listing_id: listingId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Test failed");
  }
  return res.json();
}

// --- Category Classifier ---

export interface CategoryClassifierConfig {
  id: number;
  system_prompt: string;
  confidence_threshold: number;
  enabled: boolean;
}

export async function fetchCategoryClassifier(): Promise<CategoryClassifierConfig | null> {
  const res = await fetch(`${getApiBase()}/admin/category-classifier`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch category classifier");
  const data = await res.json();
  if (data.config === null || (data.id == null && data.config == null)) return null;
  return data as CategoryClassifierConfig;
}

export async function updateCategoryClassifier(body: {
  system_prompt?: string;
  confidence_threshold?: number;
  enabled?: boolean;
}): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/category-classifier`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function testCategoryClassifier(listingId: number): Promise<{
  result: { canonical_category: string[]; confidence: number; reasoning: string } | null;
  message?: string;
}> {
  const res = await fetch(`${getApiBase()}/admin/category-classifier/test`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ listing_id: listingId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Test failed");
  }
  return res.json();
}

export async function runCategoryClassifier(params?: {
  store?: string;
  canonical_category?: string[];
  limit?: number;
}): Promise<{ ok: boolean; processed: number }> {
  const res = await fetch(`${getApiBase()}/admin/category-classifier/run`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(params ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Batch run failed";
    throw new Error(msg);
  }
  return data;
}
