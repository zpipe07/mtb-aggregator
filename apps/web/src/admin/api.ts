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
  const res = await fetch(`${getApiBase()}/admin/dashboard`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch dashboard",
    );
  return res.json();
}

export interface PipelineLatency {
  p50_seconds: number | null;
  p95_seconds: number | null;
  sample_count: number;
}

export interface PipelineEventThroughputDay {
  date: string;
  pdp: number;
  classify: number;
  extract: number;
}

export interface PipelineStorePDP {
  store_id: number;
  name: string;
  store_type: string;
  pdp_due: number;
  pdp_in_flight: number;
  pdp_dead: number;
  pdp_last_fetch_at: string | null;
  pdp_cooldown_until: string | null;
  pdp_consecutive_failures: number;
}

export interface PipelineFreshness {
  in_stock_total: number;
  never_fetched: number;
  lt_24h: number;
  d1_7: number;
  d7_30: number;
  gt_30d: number;
}

export interface PipelineMetricsResponse {
  latency: PipelineLatency;
  event_throughput: PipelineEventThroughputDay[];
  freshness: PipelineFreshness;
  stores: PipelineStorePDP[];
  recent_scrape_jobs: ScrapeJob[];
  days: number;
}

export async function fetchPipelineMetrics(
  days = 30,
): Promise<PipelineMetricsResponse> {
  const res = await fetch(
    `${getApiBase()}/admin/metrics/pipeline?days=${days}`,
    { headers: adminHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch pipeline metrics",
    );
  }
  return res.json();
}

export interface EnrichmentStepStat {
  step: string;
  due?: number;
  /** @deprecated Alias of `due`; still emitted so older Insights clients do not crash. */
  backlog?: number;
  in_flight?: number;
  dead?: number;
  oldest_due_age_seconds?: number | null;
  success_count?: number;
  failure_count?: number;
  skipped_count?: number;
  success_rate_pct?: number;
}

export interface ConfidenceBucket {
  label: string;
  count: number;
}

export interface EnrichmentStepMetricsResponse {
  steps: EnrichmentStepStat[];
  confidence_histogram: ConfidenceBucket[];
  low_confidence_count: number;
  days: number;
}

export async function fetchEnrichmentStepMetrics(
  days = 7,
): Promise<EnrichmentStepMetricsResponse> {
  const res = await fetch(
    `${getApiBase()}/admin/metrics/enrichment-steps?days=${days}`,
    { headers: adminHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Unauthorized"
        : "Failed to fetch enrichment step metrics",
    );
  }
  return res.json();
}

/** Trigger scrape; pass store type (e.g. "worldwidecyclery") to scrape one store, or omit for all. */
export async function triggerScrape(store?: string): Promise<void> {
  const url = store
    ? `${getApiBase()}/scrape-now?store=${encodeURIComponent(store)}`
    : `${getApiBase()}/scrape-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error("Scrape request failed");
}

/** Trigger enrichment; optional store, canonical_category path, llm_confidence_below, force. */
export async function triggerEnrich(opts?: {
  force?: boolean;
  store?: string;
  canonical_category?: string;
  llm_confidence_below?: number;
}): Promise<void> {
  const params = new URLSearchParams();
  if (opts?.force) params.set("force", "1");
  if (opts?.store) params.set("store", opts.store);
  if (opts?.canonical_category)
    params.set("canonical_category", opts.canonical_category);
  if (opts?.llm_confidence_below != null) {
    params.set("llm_confidence_below", String(opts.llm_confidence_below));
  }
  const qs = params.toString();
  const url = qs
    ? `${getApiBase()}/enrich-now?${qs}`
    : `${getApiBase()}/enrich-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error("Enrich request failed");
}

/** Trigger LLM spec determination (classify + extract) from DB only; async enrich job. Same auth as enrich-now. */
export async function triggerLLMSpecs(opts?: {
  store?: string;
  canonical_category?: string;
  llm_confidence_below?: number;
  allow_empty_specs?: boolean;
}): Promise<{
  ok?: boolean;
  async?: boolean;
  job_id?: number;
  total?: number;
  message?: string;
}> {
  const params = new URLSearchParams();
  if (opts?.store) params.set("store", opts.store);
  if (opts?.canonical_category)
    params.set("canonical_category", opts.canonical_category);
  if (opts?.llm_confidence_below != null) {
    params.set("llm_confidence_below", String(opts.llm_confidence_below));
  }
  if (opts?.allow_empty_specs) params.set("allow_empty_specs", "1");
  const qs = params.toString();
  const url = qs
    ? `${getApiBase()}/llm-specs-now?${qs}`
    : `${getApiBase()}/llm-specs-now`;
  const res = await fetch(url, { method: "POST", headers: adminHeaders() });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    async?: boolean;
    job_id?: number;
    total?: number;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "LLM specs request failed",
    );
  }
  return data;
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
  const res = await fetch(`${getApiBase()}/admin/stores`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch stores",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchStoreTypes(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/admin/store-types`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch store types");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Store types that support PDP enrichment (for showing Enrich button). */
export async function fetchStoreTypesWithEnrichers(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/admin/store-types-with-enrichers`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch store types with enrichers");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminStore(id: number): Promise<AdminStore | null> {
  const res = await fetch(`${getApiBase()}/admin/stores/${id}`, {
    headers: adminHeaders(),
  });
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

export async function createStore(
  body: StoreFormBody,
): Promise<{ id: number }> {
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

export async function updateStore(
  id: number,
  body: StoreFormBody,
): Promise<void> {
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
  /** LLM classification rubric (optional). */
  description?: string;
  /** Present on GET /categories/tree (subtree listing rollup). */
  deal_count?: number;
  /** Distinct product groups per subtree (matches grouped deals list). */
  product_count?: number;
  children: AdminCategoryTreeNode[];
}

export async function fetchAdminCategoryTree(): Promise<
  AdminCategoryTreeNode[]
> {
  const res = await fetch(`${getApiBase()}/admin/categories`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch categories",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface CreateCategoryBody {
  slug: string;
  name: string;
  parent_id?: number | null;
  sort_order?: number;
  /** Optional rubric for LLM category classification. */
  description?: string;
}

export async function createAdminCategory(
  body: CreateCategoryBody,
): Promise<{ id: number }> {
  const res = await fetch(`${getApiBase()}/admin/categories`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      slug: body.slug,
      name: body.name,
      parent_id: body.parent_id ?? null,
      sort_order: body.sort_order ?? 0,
      description: body.description ?? "",
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
  description?: string;
}

export async function updateAdminCategory(
  id: number,
  body: UpdateCategoryBody,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/categories/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      slug: body.slug,
      name: body.name,
      sort_order: body.sort_order ?? 0,
      description: body.description ?? "",
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
  const res = await fetch(`${getApiBase()}/admin/jobs${qs ? `?${qs}` : ""}`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch jobs",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchScrapeJob(id: number): Promise<ScrapeJob | null> {
  const res = await fetch(`${getApiBase()}/admin/jobs/${id}`, {
    headers: adminHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export async function cancelScrapeJob(
  id: number,
): Promise<{ ok: boolean; status?: string }> {
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
  job_type?: string;
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
  const res = await fetch(
    `${getApiBase()}/admin/enrich-jobs${qs ? `?${qs}` : ""}`,
    { headers: adminHeaders() },
  );
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch enrich jobs",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchEnrichJob(id: number): Promise<EnrichJob | null> {
  const res = await fetch(`${getApiBase()}/admin/enrich-jobs/${id}`, {
    headers: adminHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch enrich job");
  return res.json();
}

export async function cancelEnrichJob(
  id: number,
): Promise<{ ok: boolean; status?: string }> {
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
  home_demoted?: boolean;
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
  home_demoted?: boolean;
  category?: string;
  /** Subtree filter on category_id — same semantics as GET /deals?category_slug= */
  category_slug?: string;
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
  if (params?.has_canonical_category != null)
    search.set(
      "has_canonical_category",
      params.has_canonical_category ? "true" : "false",
    );
  if (params?.has_enrichment != null)
    search.set("has_enrichment", params.has_enrichment ? "true" : "false");
  if (params?.in_stock != null)
    search.set("in_stock", params.in_stock ? "true" : "false");
  if (params?.hidden != null)
    search.set("hidden", params.hidden ? "true" : "false");
  if (params?.home_demoted != null)
    search.set("home_demoted", params.home_demoted ? "true" : "false");
  if (params?.category) search.set("category", params.category);
  if (params?.category_slug)
    search.set("category_slug", params.category_slug);
  if (params?.canonical_category)
    search.set("canonical_category", params.canonical_category);
  if (params?.llm_confidence_below != null)
    search.set("llm_confidence_below", String(params.llm_confidence_below));
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(
    `${getApiBase()}/admin/listings${qs ? `?${qs}` : ""}`,
    { headers: adminHeaders() },
  );
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch listings",
    );
  const data = await res.json();
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export async function fetchAdminListing(
  id: number,
): Promise<AdminListing | null> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}`, {
    headers: adminHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch listing");
  return res.json();
}

/** Profile field from GET /admin/categories/:id/profile-fields (effective extraction schema). */
export interface AdminProfileField {
  key: string;
  type: string;
  description?: string;
  values?: string[];
  label?: string;
  sort_order?: number;
  filterable?: boolean;
}

export interface TaxonomyMappingSuggestion {
  raw_keywords: string[];
  canonical: string[];
  reason: string;
}

export interface SetListingCategoryResult {
  ok: boolean;
  siblings_updated?: number;
  suggested_mapping?: TaxonomyMappingSuggestion;
}

/** Set canonical category for a listing (admin manual override). */
export async function setListingCategory(
  id: number,
  categoryId: number,
): Promise<SetListingCategoryResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}/category`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ category_id: categoryId }),
  });
  const data = (await res.json().catch(() => ({}))) as SetListingCategoryResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : res.status === 404
          ? "Listing not found"
          : "Update failed";
    throw new Error(msg);
  }
  return data;
}

/** Effective LLM profile fields for a category (merged ancestor profiles). */
export async function fetchCategoryProfileFields(
  categoryId: number,
): Promise<AdminProfileField[]> {
  const res = await fetch(
    `${getApiBase()}/admin/categories/${categoryId}/profile-fields`,
    { headers: adminHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch profile fields",
    );
  }
  const data = (await res.json()) as { fields?: AdminProfileField[] };
  return Array.isArray(data.fields) ? data.fields : [];
}

/** Set hidden and/or home_demoted flags for a listing. */
export async function patchAdminListing(
  id: number,
  patch: { hidden?: boolean; home_demoted?: boolean },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/listings/${id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : res.status === 404
          ? "Listing not found"
          : "Update failed";
    throw new Error(msg);
  }
}

/** Set hidden flag for a listing. Hidden listings are excluded from the public deals feed. */
export async function setListingHidden(
  id: number,
  hidden: boolean,
): Promise<void> {
  return patchAdminListing(id, { hidden });
}

/** Demote or restore a listing on the home page top-deal sections. */
export async function setListingHomeDemoted(
  id: number,
  homeDemoted: boolean,
): Promise<void> {
  return patchAdminListing(id, { home_demoted: homeDemoted });
}

/** Set LLM overrides for a listing. Body is the overrides map e.g. { mtb_class: "Trail" }. Pass null for a key to clear. */
export async function setListingLLMOverrides(
  id: number,
  overrides: Record<string, string | string[] | null>,
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/admin/listings/${id}/llm-overrides`,
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(overrides),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Update failed";
    throw new Error(msg);
  }
}

/** Re-run LLM extraction for all listings in a canonical category. */
export async function runLLMExtractionForCategory(
  canonicalCategory: string[],
): Promise<{ ok: boolean; processed: number }> {
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
export async function enrichListing(
  id: number,
): Promise<{ ok: boolean; category_path: string[] }> {
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

/** Re-run LLM classification + extraction for one listing (no PDP scrape). */
export async function runListingLLMSpecs(
  id: number,
  opts?: { allow_empty_specs?: boolean },
): Promise<{ ok: boolean; llm_warnings?: string[] }> {
  const params = new URLSearchParams();
  if (opts?.allow_empty_specs) params.set("allow_empty_specs", "1");
  const qs = params.toString();
  const url = qs
    ? `${getApiBase()}/admin/listings/${id}/llm-specs?${qs}`
    : `${getApiBase()}/admin/listings/${id}/llm-specs`;
  const res = await fetch(url, {
    method: "POST",
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "LLM specs failed";
    throw new Error(msg);
  }
  return data as { ok: boolean; llm_warnings?: string[] };
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
  const res = await fetch(`${getApiBase()}/admin/taxonomy`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch taxonomy",
    );
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
  body: { raw_keywords: string[]; canonical: string[]; priority?: number },
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
  updates: { id: number; priority: number }[],
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
  const res = await fetch(`${getApiBase()}/admin/spec-filter-config`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? "Unauthorized"
        : "Failed to fetch spec filter config",
    );
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
  },
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

export async function fetchSpecValueAliases(
  specKey?: string,
): Promise<SpecValueAlias[]> {
  const search = specKey ? `?spec_key=${encodeURIComponent(specKey)}` : "";
  const res = await fetch(`${getApiBase()}/admin/spec-value-aliases${search}`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? "Unauthorized"
        : "Failed to fetch spec value aliases",
    );
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
  body: { spec_key: string; raw_value: string; display_value: string },
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
  const res = await fetch(`${getApiBase()}/admin/spec-keys`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch spec keys",
    );
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

// --- Database maintenance (migrations, seed) ---

export interface MigrationEntry {
  filename: string;
  applied: boolean;
  applied_at?: string;
}

export interface DBMigrationsResponse {
  migrations_dir: string;
  migrations: MigrationEntry[];
  pending_count: number;
  ops_allowed: boolean;
}

export interface DBMigrateResponse {
  applied: string[];
  skipped: string[];
  total: number;
}

export interface DBSeedResponse {
  ok: boolean;
  seed_file: string;
}

export async function fetchDBMigrations(): Promise<DBMigrationsResponse> {
  const res = await fetch(`${getApiBase()}/admin/db/migrations`, {
    headers: adminHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch migration status",
    );
  }
  return res.json();
}

export async function runDBMigrate(): Promise<DBMigrateResponse> {
  const res = await fetch(`${getApiBase()}/admin/db/migrate`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Migration run failed");
  }
  return res.json();
}

export async function runDBSeed(): Promise<DBSeedResponse> {
  const res = await fetch(`${getApiBase()}/admin/db/seed`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Seed run failed");
  }
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

export async function fetchUnmappedItems(
  limit?: number,
): Promise<UnmappedItemsResponse> {
  const params = limit != null ? `?limit=${limit}` : "";
  const res = await fetch(
    `${getApiBase()}/admin/normalization/unmapped${params}`,
    {
      headers: adminHeaders(),
    },
  );
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

export async function fetchSpecNormalizationRules(): Promise<
  SpecNormalizationRule[]
> {
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
  body: {
    spec_key: string;
    rule_type: string;
    config?: Record<string, unknown>;
    priority?: number;
  },
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
  body: { raw_substr: string; canonical_key: string; priority?: number },
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/admin/normalization/key-aliases/${id}`,
    {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({
        raw_substr: body.raw_substr,
        canonical_key: body.canonical_key,
        priority: body.priority ?? 0,
      }),
    },
  );
  if (!res.ok) throw new Error("Update failed");
}

export async function deleteSpecKeyAlias(id: number): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/admin/normalization/key-aliases/${id}`,
    {
      method: "DELETE",
      headers: adminHeaders(),
    },
  );
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
  /** Present on GET detail when category_id is set: merged schema (ancestors + this category). */
  effective_extraction_schema?: Record<string, unknown>;
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

export async function fetchLLMExtractionFieldDefs(
  q?: string,
): Promise<LLMExtractionFieldDef[]> {
  // Do not use `new URL(relativePath)` — it throws without a base; getApiBase() is often `/api` (relative).
  let url = `${getApiBase().replace(/\/$/, "")}/admin/llm-extraction-field-defs`;
  if (q?.trim()) {
    url += `?${new URLSearchParams({ q: q.trim() })}`;
  }
  const res = await fetch(url, { headers: adminHeaders() });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch field definitions",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchLLMExtractionFieldDef(
  id: number,
): Promise<LLMExtractionFieldDef> {
  const res = await fetch(
    `${getApiBase()}/admin/llm-extraction-field-defs/${id}`,
    { headers: adminHeaders() },
  );
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
  },
): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/admin/llm-extraction-field-defs/${id}`,
    {
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
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Update failed");
  }
}

export async function deleteLLMExtractionFieldDef(id: number): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/admin/llm-extraction-field-defs/${id}`,
    {
      method: "DELETE",
      headers: adminHeaders(),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Delete failed");
  }
}

export async function fetchLLMProfiles(): Promise<LLMPromptProfile[]> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch LLM profiles",
    );
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchLLMProfile(id: number): Promise<LLMPromptProfile> {
  const res = await fetch(`${getApiBase()}/admin/llm-profiles/${id}`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401 ? "Unauthorized" : "Failed to fetch profile",
    );
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
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.canonical_category !== undefined)
    payload.canonical_category = body.canonical_category;
  if (body.name !== undefined) payload.name = body.name;
  if (body.system_prompt !== undefined)
    payload.system_prompt = body.system_prompt;
  if (body.enabled !== undefined) payload.enabled = body.enabled;
  if (body.extraction_schema !== undefined)
    payload.extraction_schema = body.extraction_schema;
  if (body.profile_fields !== undefined)
    payload.profile_fields = body.profile_fields;
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

export async function testLLMProfile(
  profileId: number,
  listingId: number,
): Promise<{ result: Record<string, unknown> | null; message?: string }> {
  const res = await fetch(
    `${getApiBase()}/admin/llm-profiles/${profileId}/test`,
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ listing_id: listingId }),
    },
  );
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
  const res = await fetch(`${getApiBase()}/admin/category-classifier`, {
    headers: adminHeaders(),
  });
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? "Unauthorized"
        : "Failed to fetch category classifier",
    );
  const data = await res.json();
  if (data.config === null || (data.id == null && data.config == null))
    return null;
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
  result: {
    canonical_category: string[];
    confidence: number;
    reasoning: string;
  } | null;
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
  ids?: number[];
  has_enrichment?: boolean;
  min_confidence?: number;
  max_confidence?: number;
  llm_confidence_below?: number;
  limit?: number;
  dry_run?: boolean;
}): Promise<
  | { ok: true; async: true; job_id: number; total: number; message?: string }
  | { ok: true; async: false; processed: number; job_id: number; total: number }
  | {
      ok: true;
      total: number;
      max_per_run: number;
      exceeds_max: boolean;
      sample: { id: number; product_name: string }[];
    }
> {
  const res = await fetch(`${getApiBase()}/admin/category-classifier/run`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(params ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Batch run failed";
    throw new Error(msg);
  }
  return data;
}

/** Distinct canonical category paths (public API) for filter dropdowns. */
export async function fetchCanonicalCategoryPaths(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/canonical-categories`);
  if (!res.ok) throw new Error("Failed to load canonical categories");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface AdminBulkListingsFilterBody {
  store_id?: number;
  brand?: string;
  has_canonical_category?: boolean;
  has_enrichment?: boolean;
  in_stock?: boolean;
  hidden?: boolean;
  home_demoted?: boolean;
  category?: string;
  category_slug?: string;
  canonical_category?: string;
  q?: string;
  llm_confidence_below?: number;
  /** When false, listings without metadata.specs match; omit to server-default for bulk LLM specs. */
  has_non_empty_specs?: boolean;
}

export type BulkListingsResult =
  | {
      ok: true;
      async: false;
      processed: number;
      total: number;
      job_id: number;
      enriched?: number;
    }
  | {
      ok: true;
      async: true;
      job_id: number;
      total: number;
      message?: string;
    };

export async function postAdminListingsBulkClassify(
  body: AdminBulkListingsFilterBody,
): Promise<BulkListingsResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-classify`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkListingsResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Bulk classify failed";
    throw new Error(msg);
  }
  return data as BulkListingsResult;
}

export async function postAdminListingsBulkEnrich(
  body: AdminBulkListingsFilterBody,
): Promise<BulkListingsResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-enrich`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkListingsResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Bulk enrich failed";
    throw new Error(msg);
  }
  return data as BulkListingsResult;
}

export interface BulkSetCategoryBody extends AdminBulkListingsFilterBody {
  category_id: number;
}

export interface BulkSetCategoryResult {
  ok: boolean;
  updated: number;
  total: number;
}

export async function postAdminListingsBulkSetCategory(
  body: BulkSetCategoryBody,
): Promise<BulkSetCategoryResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-set-category`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkSetCategoryResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Bulk set category failed";
    throw new Error(msg);
  }
  return data;
}

export interface BulkSetHomeDemotedBody extends AdminBulkListingsFilterBody {
  home_demoted: boolean;
}

export interface BulkSetHomeDemotedResult {
  ok: boolean;
  updated: number;
  total: number;
}

export async function postAdminListingsBulkSetHomeDemoted(
  body: BulkSetHomeDemotedBody,
): Promise<BulkSetHomeDemotedResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-set-home-demoted`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkSetHomeDemotedResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : "Bulk home demote update failed";
    throw new Error(msg);
  }
  return data;
}

export interface BulkSetHiddenBody extends AdminBulkListingsFilterBody {
  hidden: boolean;
}

export interface BulkSetHiddenResult {
  ok: boolean;
  updated: number;
  total: number;
}

export async function postAdminListingsBulkSetHidden(
  body: BulkSetHiddenBody,
): Promise<BulkSetHiddenResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-set-hidden`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkSetHiddenResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Bulk hide update failed";
    throw new Error(msg);
  }
  return data;
}

export async function postAdminListingsBulkLLMSpecs(
  body: AdminBulkListingsFilterBody,
): Promise<BulkListingsResult> {
  const res = await fetch(`${getApiBase()}/admin/listings/bulk-llm-specs`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as BulkListingsResult & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string" ? data.error : "Bulk LLM specs failed";
    throw new Error(msg);
  }
  return data as BulkListingsResult;
}

export interface RevalidateCacheRequest {
  path?: string;
  paths?: string[];
  tag?: string;
  tags?: string[];
  purge_all?: boolean;
  type?: "page" | "layout";
}

export interface RevalidateCacheResponse {
  ok: boolean;
  revalidated_paths: string[];
  revalidated_queries?: string[];
  revalidated_tags: string[];
  purged_all?: boolean;
  type: "page" | "layout";
  note?: string;
  default_public_tag: string;
}

/** On-demand ISR / fetch cache purge (Next.js route, not Go API). */
export async function revalidateCache(
  body: RevalidateCacheRequest,
): Promise<RevalidateCacheResponse> {
  const res = await fetch("/admin/api/revalidate", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as RevalidateCacheResponse & {
    error?: string;
  };
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : res.status === 401
          ? "Unauthorized"
          : res.status === 503
            ? "Cache purge unavailable (set ADMIN_PASSWORD on the web app)"
            : "Cache revalidation failed";
    throw new Error(msg);
  }
  return data;
}
