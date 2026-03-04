const API_BASE = import.meta.env.VITE_API_URL || "/api";

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
  const res = await fetch(`${API_BASE}/admin/auth`, {
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
  const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch dashboard");
  return res.json();
}

/** Trigger scrape; pass store type (e.g. "worldwidecyclery") to scrape one store, or omit for all. */
export async function triggerScrape(store?: string): Promise<void> {
  const url = store ? `${API_BASE}/scrape-now?store=${encodeURIComponent(store)}` : `${API_BASE}/scrape-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error("Scrape request failed");
}

/** Trigger enrichment; pass force=true to re-enrich all, or store=store_type to enrich one store. */
export async function triggerEnrich(force?: boolean, store?: string): Promise<void> {
  const params = new URLSearchParams();
  if (force) params.set("force", "1");
  if (store) params.set("store", store);
  const qs = params.toString();
  const url = qs ? `${API_BASE}/enrich-now?${qs}` : `${API_BASE}/enrich-now`;
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
  const res = await fetch(`${API_BASE}/admin/stores`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch stores");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchStoreTypes(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/admin/store-types`, { headers: adminHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store types");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Store types that support PDP enrichment (for showing Enrich button). */
export async function fetchStoreTypesWithEnrichers(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/admin/store-types-with-enrichers`, { headers: adminHeaders() });
  if (!res.ok) throw new Error("Failed to fetch store types with enrichers");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminStore(id: number): Promise<AdminStore | null> {
  const res = await fetch(`${API_BASE}/admin/stores/${id}`, { headers: adminHeaders() });
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
  const res = await fetch(`${API_BASE}/admin/stores`, {
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
  const res = await fetch(`${API_BASE}/admin/stores/${id}`, {
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
  const res = await fetch(`${API_BASE}/admin/stores/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
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
  const res = await fetch(`${API_BASE}/admin/jobs${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch jobs");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchScrapeJob(id: number): Promise<ScrapeJob | null> {
  const res = await fetch(`${API_BASE}/admin/jobs/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export async function cancelScrapeJob(id: number): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch(`${API_BASE}/admin/jobs/${id}/cancel`, {
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
  const res = await fetch(`${API_BASE}/admin/enrich-jobs${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch enrich jobs");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchEnrichJob(id: number): Promise<EnrichJob | null> {
  const res = await fetch(`${API_BASE}/admin/enrich-jobs/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch enrich job");
  return res.json();
}

export async function cancelEnrichJob(id: number): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch(`${API_BASE}/admin/enrich-jobs/${id}/cancel`, {
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
  metadata?: Record<string, unknown>;
  is_in_stock: boolean;
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
  category?: string;
  canonical_category?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminListingsResponse> {
  const search = new URLSearchParams();
  if (params?.store_id != null) search.set("store_id", String(params.store_id));
  if (params?.brand) search.set("brand", params.brand);
  if (params?.has_canonical_category != null) search.set("has_canonical_category", params.has_canonical_category ? "true" : "false");
  if (params?.has_enrichment != null) search.set("has_enrichment", params.has_enrichment ? "true" : "false");
  if (params?.category) search.set("category", params.category);
  if (params?.canonical_category) search.set("canonical_category", params.canonical_category);
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`${API_BASE}/admin/listings${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch listings");
  const data = await res.json();
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export async function fetchAdminListing(id: number): Promise<AdminListing | null> {
  const res = await fetch(`${API_BASE}/admin/listings/${id}`, { headers: adminHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch listing");
  return res.json();
}

/** Run enrichment for a single listing. Returns { ok, category_path } or throws with error message. */
export async function enrichListing(id: number): Promise<{ ok: boolean; category_path: string[] }> {
  const res = await fetch(`${API_BASE}/admin/listings/${id}/enrich`, {
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
  const res = await fetch(`${API_BASE}/admin/taxonomy`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch taxonomy");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createTaxonomyMapping(body: {
  raw_keywords: string[];
  canonical: string[];
  priority?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/admin/taxonomy`, {
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
  const res = await fetch(`${API_BASE}/admin/taxonomy/${id}`, {
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
  const res = await fetch(`${API_BASE}/admin/taxonomy/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function triggerRecategorize(): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/admin/taxonomy/recategorize`, {
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
  const res = await fetch(`${API_BASE}/admin/spec-filter-config`, { headers: adminHeaders() });
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
  const res = await fetch(`${API_BASE}/admin/spec-filter-config`, {
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
  const res = await fetch(`${API_BASE}/admin/spec-filter-config/${id}`, {
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
  const res = await fetch(`${API_BASE}/admin/spec-filter-config/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function fetchSpecValueAliases(specKey?: string): Promise<SpecValueAlias[]> {
  const search = specKey ? `?spec_key=${encodeURIComponent(specKey)}` : "";
  const res = await fetch(`${API_BASE}/admin/spec-value-aliases${search}`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch spec value aliases");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createSpecValueAlias(body: {
  spec_key: string;
  raw_value: string;
  display_value: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/admin/spec-value-aliases`, {
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
  const res = await fetch(`${API_BASE}/admin/spec-value-aliases/${id}`, {
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
  const res = await fetch(`${API_BASE}/admin/spec-value-aliases/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function fetchSpecKeys(): Promise<DiscoveredSpecKey[]> {
  const res = await fetch(`${API_BASE}/admin/spec-keys`, { headers: adminHeaders() });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to fetch spec keys");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function triggerRenormalizeSpecs(): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/admin/renormalize-specs`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Renormalize specs failed");
  return res.json();
}
