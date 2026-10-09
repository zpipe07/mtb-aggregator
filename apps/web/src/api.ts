import { getApiBase } from "@/lib/api";
import { normalizeCategoryTree } from "@/lib/categoryTree";
import {
  GIVEAWAYS_CACHE_TAG,
  GIVEAWAYS_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAG,
  PUBLIC_ISR_REVALIDATE_SECONDS,
} from "@/lib/revalidate";
import type { GiveawayKind, GiveawayStatus } from "@/lib/giveawayStatus";

export type { GiveawayKind, GiveawayStatus };

/** One SKU variant when deals are grouped (Shopify). */
export interface DealVariantRow {
  id: number;
  store_sku: string;
  variant_options?: Record<string, string> | null;
  current_price: number;
  original_price?: number | null;
  is_in_stock: boolean;
}

export interface PriceHistorySummary {
  lowest_price: number;
  highest_price: number;
  price_dropped: boolean;
  point_count: number;
}

export interface Deal {
  id: number;
  store_id: number;
  store_name: string;
  store_sku: string;
  product_name: string;
  current_price: number;
  original_price?: number;
  product_url: string;
  affiliate_url?: string;
  image_url?: string;
  brand?: string;
  category_path?: string[];
  canonical_category?: string[];
  metadata?: {
    specs?: Record<string, string>;
    llm_specs?: Record<string, unknown>;
  };
  is_in_stock: boolean;
  discount_pct?: number;
  last_scraped: string;
  product_group_key?: string;
  variant_options?: Record<string, string>;
  variants?: DealVariantRow[];
  variant_count?: number;
  /** [min, max] when grouped and prices differ */
  price_range?: number[];
  /** Aggregate stats for deal scoring on list responses (≥2 history points). */
  price_history_summary?: PriceHistorySummary;
}

export interface Store {
  id: number;
  name: string;
  base_url: string;
  /** Distinct in-stock, visible product groups for this store (matches grouped deals list). */
  deal_count: number;
  last_scraped: string;
}

export interface DealListResponse {
  deals: Deal[];
  total_count: number;
}

const DEFAULT_PAGE_SIZE = 24;

/** Skip Next.js data cache (bulk SEO fetches that exceed the 2MB cache limit). */
type FetchCacheOptions = { noStore?: boolean };

const PUBLIC_FETCH_CACHE: RequestInit = {
  next: {
    revalidate: PUBLIC_ISR_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAG],
  },
};

function publicFetchInit(options?: FetchCacheOptions): RequestInit {
  if (options?.noStore) return { cache: "no-store" };
  return PUBLIC_FETCH_CACHE;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [500, 1000];

/**
 * Deadline for one public catalog attempt (deals, facets, giveaways).
 * Soft-nav on `/deals` warns at 15s (`usePendingTimeout`). A hung Render
 * socket must fail into the route error boundary before that watchdog.
 * Timeouts are not retried — two 10s attempts would blow the client budget.
 */
export const PUBLIC_API_TIMEOUT_MS = 10_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableResponse(res: Response): boolean {
  return RETRYABLE_STATUS.has(res.status);
}

export function isFetchTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function withAttemptTimeout(
  init: RequestInit | undefined,
  timeoutMs: number,
): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return { ...init, signal };
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { retries?: number; delaysMs?: number[]; timeoutMs?: number },
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const delaysMs = options?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options?.timeoutMs ?? PUBLIC_API_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, withAttemptTimeout(init, timeoutMs));
      if (res.ok || attempt >= retries || !isRetryableResponse(res)) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (isFetchTimeoutError(err)) {
        throw new Error("Public API fetch timed out");
      }
      // Caller or a newer navigation aborted this attempt. Don't retry.
      if (isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= retries) throw err;
    }

    await sleep(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 1000);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Fetch failed after retries");
}

export type FetchDealsParams = {
  store?: string;
  /** Repeated `brand` query params (OR). */
  brands?: string[];
  /**
   * Page-locked brands (AND with `brands`). SEO hubs and brand pages pass the
   * route brand here so facet lists stay inside that page.
   */
  brand_scope?: string[];
  category?: string;
  category_slug?: string;
  canonical_category?: string;
  min_discount?: number;
  /** Minimum current_price (inclusive). */
  min_price?: number;
  /** Maximum current_price (inclusive). */
  max_price?: number;
  /** Exclude listings in this category subtree (e.g. `accessories`). */
  exclude_category_slug?: string;
  /** Exclude listings demoted from home page top-deal sections. */
  exclude_home_demoted?: boolean;
  q?: string;
  sort?: string;
  /** When true, only listings with a scrape-to-scrape price decrease within the recency window. */
  price_dropped?: boolean;
  /** Recency window in days for price_dropped / sort=price_drop (default 7). */
  price_drop_within_days?: number;
  limit?: number;
  offset?: number;
  specFilters?: Record<string, string[]>;
  /** Default true: collapse Shopify variants into one card */
  group_variants?: boolean;
  /**
   * When true, `total_count` comes from a second fetch with offset=0&limit=1 so
   * every page of the same filter set shares one Next.js cache key (ZAC-236).
   */
  stableTotalCount?: boolean;
} & FetchCacheOptions;

/** Canonical count-query params so page 1 and page N share one fetch-cache URL. */
export function dealsStableCountParams(
  params: FetchDealsParams,
): FetchDealsParams {
  const rest = { ...params, offset: 0, limit: 1 };
  delete rest.stableTotalCount;
  return rest;
}

export async function fetchDeals(
  params?: FetchDealsParams,
): Promise<DealListResponse> {
  if (!params?.stableTotalCount) {
    return fetchDealsPage(params);
  }
  const [page, count] = await Promise.all([
    fetchDealsPage(params),
    fetchDealsPage(dealsStableCountParams(params)),
  ]);
  return { deals: page.deals, total_count: count.total_count };
}

async function fetchDealsPage(
  params?: FetchDealsParams,
): Promise<DealListResponse> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brands?.length) {
    for (const b of params.brands) {
      const t = b.trim();
      if (t) search.append("brand", t);
    }
  }
  if (params?.brand_scope?.length) {
    for (const b of params.brand_scope) {
      const t = b.trim();
      if (t) search.append("brand_scope", t);
    }
  }
  if (params?.category) search.set("category", params.category);
  if (params?.category_slug) search.set("category_slug", params.category_slug);
  if (params?.canonical_category)
    search.set("canonical_category", params.canonical_category);
  if (params?.min_discount != null)
    search.set("min_discount", String(params.min_discount));
  if (params?.min_price != null)
    search.set("min_price", String(params.min_price));
  if (params?.max_price != null)
    search.set("max_price", String(params.max_price));
  if (params?.exclude_category_slug)
    search.set("exclude_category_slug", params.exclude_category_slug);
  if (params?.exclude_home_demoted)
    search.set("exclude_home_demoted", "true");
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.price_dropped) search.set("price_dropped", "true");
  if (params?.price_drop_within_days != null)
    search.set("price_drop_within_days", String(params.price_drop_within_days));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.group_variants !== false) search.set("group_variants", "true");
  if (params?.specFilters && Object.keys(params.specFilters).length > 0) {
    for (const [key, values] of Object.entries(params.specFilters)) {
      if (!key) continue;
      for (const value of values) {
        const t = value.trim();
        if (t) search.append(`spec_${key}`, t);
      }
    }
  }
  const qs = search.toString();
  const url = `${getApiBase()}/deals${qs ? `?${qs}` : ""}`;
  const res = await fetchWithRetry(
    url,
    publicFetchInit({ noStore: params?.noStore }),
  );
  if (!res.ok) throw new Error("Failed to fetch deals");
  const data = await res.json();
  return {
    deals: Array.isArray(data.deals) ? data.deals : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export { DEFAULT_PAGE_SIZE };

export async function fetchDeal(id: number): Promise<Deal> {
  const res = await fetch(`${getApiBase()}/deals/${id}`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch deal");
  return res.json();
}

export type SitemapListing = {
  id: number;
  last_scraped?: string;
};

export type SitemapListingsResponse = {
  listings: SitemapListing[];
};

/** Compact indexable deal IDs for /sitemap.xml (in-stock, not hidden, grouped). */
export async function fetchSitemapListings(
  limit: number,
): Promise<SitemapListing[]> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  const url = `${getApiBase()}/sitemap-listings?${search}`;
  const res = await fetchWithRetry(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sitemap listings");
  const data = (await res.json()) as SitemapListingsResponse;
  return Array.isArray(data?.listings) ? data.listings : [];
}

export interface PriceHistoryPoint {
  price: number;
  recorded_at: string;
}

export interface PriceHistoryResponse {
  points: PriceHistoryPoint[];
  lowest_price: number;
  highest_price: number;
  avg_price: number;
  price_dropped: boolean;
}

export async function fetchPriceHistory(
  dealId: number,
): Promise<PriceHistoryResponse> {
  const res = await fetch(`${getApiBase()}/deals/${dealId}/price-history`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch price history");
  return res.json();
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch(`${getApiBase()}/stores`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch stores");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchBrands(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/brands`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch brands");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Structured category tree from GET /categories/tree. Used for filter UI and links. */
export interface CategoryTreeNode {
  id: number;
  slug: string;
  name: string;
  parent_id: number | null;
  sort_order: number;
  depth: number;
  /** In-stock, visible listing rows in this category or any descendant (subtree rollup). */
  deal_count: number;
  /**
   * Distinct product groups in this subtree (matches `GET /deals?group_variants=true` totals).
   * Shopper-facing counts (homepage, mega-menu, chips, categories hub, unfiltered
   * listing headers) use this via `categoryNavDealCount`. When missing (older API),
   * fall back to `deal_count`.
   */
  product_count?: number;
  /** When true, omit from the header mega-menu and in-category browse chips. Still shown on /categories and the root `/deals` chip row. */
  hide_from_nav?: boolean;
  children: CategoryTreeNode[];
}

export async function fetchCategoryTree(): Promise<CategoryTreeNode[]> {
  const res = await fetch(`${getApiBase()}/categories/tree`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch category tree");
  const data = await res.json();
  return normalizeCategoryTree(Array.isArray(data) ? data : []);
}

export interface SpecFacetValue {
  value: string;
  count: number;
}

export interface SpecFacet {
  key: string;
  label: string;
  product_count: number;
  values: SpecFacetValue[];
}

export interface BrandFacet {
  value: string;
  count: number;
}

/** Store option scoped to the current deals filters. Same shape as {@link BrandFacet}. */
export interface StoreFacet {
  value: string;
  count: number;
}

export interface FacetsResponse {
  spec_facets: SpecFacet[];
  brand_facets: BrandFacet[];
  /**
   * Present when the API scopes stores to the current filters.
   * Missing on older responses — callers may fall back to global `GET /stores`.
   */
  store_facets?: StoreFacet[];
  price_range: { min: number; max: number };
  total_matching: number;
}

const EMPTY_FACETS: FacetsResponse = {
  spec_facets: [],
  brand_facets: [],
  price_range: { min: 0, max: 0 },
  total_matching: 0,
};

/** Go nil slices serialize as JSON null; coerce to arrays for safe `.filter` / `.map`. */
export function normalizeFacetsResponse(
  response: FacetsResponse | null | undefined,
  brandFacetsOverride?: BrandFacet[] | null,
): FacetsResponse {
  const base = response ?? EMPTY_FACETS;
  return {
    spec_facets: base.spec_facets ?? [],
    brand_facets: brandFacetsOverride ?? base.brand_facets ?? [],
    // null/omitted means an older API; [] means no store matches the current filters.
    store_facets: base.store_facets ?? undefined,
    price_range: base.price_range ?? EMPTY_FACETS.price_range,
    total_matching: base.total_matching ?? 0,
  };
}

export interface FacetsParams {
  store?: string;
  brands?: string[];
  /** Page-locked brands. Still applied when `brand_facets` omit `brands`. */
  brand_scope?: string[];
  category?: string;
  category_slug?: string;
  canonical_category?: string;
  min_discount?: number;
  min_price?: number;
  max_price?: number;
  exclude_category_slug?: string;
  q?: string;
  specFilters?: Record<string, string[]>;
}

export async function fetchFacets(
  params?: FacetsParams & FetchCacheOptions,
): Promise<FacetsResponse> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brands?.length) {
    for (const b of params.brands) {
      const t = b.trim();
      if (t) search.append("brand", t);
    }
  }
  if (params?.brand_scope?.length) {
    for (const b of params.brand_scope) {
      const t = b.trim();
      if (t) search.append("brand_scope", t);
    }
  }
  if (params?.category) search.set("category", params.category);
  if (params?.category_slug) search.set("category_slug", params.category_slug);
  if (params?.canonical_category)
    search.set("canonical_category", params.canonical_category);
  if (params?.min_discount != null)
    search.set("min_discount", String(params.min_discount));
  if (params?.min_price != null)
    search.set("min_price", String(params.min_price));
  if (params?.max_price != null)
    search.set("max_price", String(params.max_price));
  if (params?.exclude_category_slug)
    search.set("exclude_category_slug", params.exclude_category_slug);
  if (params?.q) search.set("q", params.q);
  if (params?.specFilters) {
    for (const [key, values] of Object.entries(params.specFilters)) {
      if (!key) continue;
      for (const value of values) {
        const t = value.trim();
        if (t) search.append(`spec_${key}`, t);
      }
    }
  }
  const qs = search.toString();
  const res = await fetchWithRetry(
    `${getApiBase()}/facets${qs ? `?${qs}` : ""}`,
    publicFetchInit({ noStore: params?.noStore }),
  );
  if (!res.ok) throw new Error("Failed to fetch facets");
  return res.json();
}

/** Distinct spec values for a given metadata key, e.g. "material" or "tooth_count". */
export async function fetchSpecValues(key: string): Promise<string[]> {
  const search = new URLSearchParams();
  search.set("key", key);
  const res = await fetch(`${getApiBase()}/spec-values?${search.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch spec values");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface StoreStatus {
  name: string;
  deal_count: number;
  last_scraped: string;
  success: boolean;
}

export interface Status {
  stores: StoreStatus[];
  scraper_reachable: boolean;
}

export async function fetchStatus(): Promise<Status> {
  const res = await fetch(`${getApiBase()}/status`, PUBLIC_FETCH_CACHE);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export type Giveaway = {
  id: number;
  slug: string;
  kind: GiveawayKind;
  title: string;
  summary: string;
  prize_name: string;
  prize_description?: string | null;
  image_url?: string | null;
  host_name: string;
  entry_url: string;
  official_rules_url: string;
  starts_at?: string | null;
  ends_at: string;
  eligibility?: string | null;
  entry_requirements?: string | null;
  ticket_price?: number | null;
  ticket_currency?: string;
  beneficiary?: string | null;
  status: GiveawayStatus;
};

export type GiveawaysResponse = {
  giveaways: Giveaway[];
  open_count: number;
  upcoming_count: number;
  ended_count: number;
};

export async function fetchGiveaways(options?: {
  kind?: GiveawayKind;
  noStore?: boolean;
  /**
   * Override the 60s giveaways TTL. Next hashes the request URL, not
   * `revalidate`, so a non-default TTL also sets `_isr` (the API ignores it)
   * and does not share a cache entry with `/giveaways`.
   */
  revalidate?: number;
}): Promise<GiveawaysResponse> {
  const search = new URLSearchParams();
  if (options?.kind) search.set("kind", options.kind);
  const revalidate = options?.revalidate ?? GIVEAWAYS_REVALIDATE_SECONDS;
  if (revalidate !== GIVEAWAYS_REVALIDATE_SECONDS) {
    search.set("_isr", String(revalidate));
  }
  const qs = search.toString();
  const init = options?.noStore
    ? { cache: "no-store" as const }
    : {
        next: {
          revalidate,
          tags: [PUBLIC_DATA_CACHE_TAG, GIVEAWAYS_CACHE_TAG],
        },
      };
  const res = await fetchWithRetry(
    `${getApiBase()}/giveaways${qs ? `?${qs}` : ""}`,
    init,
  );
  if (!res.ok) throw new Error("Failed to fetch giveaways");
  const data = (await res.json()) as GiveawaysResponse;
  return {
    giveaways: Array.isArray(data.giveaways) ? data.giveaways : [],
    open_count: data.open_count ?? 0,
    upcoming_count: data.upcoming_count ?? 0,
    ended_count: data.ended_count ?? 0,
  };
}
