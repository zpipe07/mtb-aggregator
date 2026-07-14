import { getApiBase } from "@/lib/api";
import { PUBLIC_ISR_REVALIDATE_SECONDS } from "@/lib/revalidate";

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
  deal_count: number;
  last_scraped: string;
}

export interface DealListResponse {
  deals: Deal[];
  total_count: number;
}

const DEFAULT_PAGE_SIZE = 24;

export async function fetchDeals(params?: {
  store?: string;
  /** Repeated `brand` query params (OR). */
  brands?: string[];
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
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  specFilters?: Record<string, string[]>;
  /** Default true: collapse Shopify variants into one card */
  group_variants?: boolean;
}): Promise<DealListResponse> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brands?.length) {
    for (const b of params.brands) {
      const t = b.trim();
      if (t) search.append("brand", t);
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
  if (params?.sort) search.set("sort", params.sort);
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
  const res = await fetch(url, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch deals");
  const data = await res.json();
  return {
    deals: Array.isArray(data.deals) ? data.deals : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export { DEFAULT_PAGE_SIZE };

export async function fetchDeal(id: number): Promise<Deal> {
  const res = await fetch(`${getApiBase()}/deals/${id}`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch deal");
  return res.json();
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
  const res = await fetch(`${getApiBase()}/deals/${dealId}/price-history`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch price history");
  return res.json();
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch(`${getApiBase()}/stores`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch stores");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchBrands(): Promise<string[]> {
  const res = await fetch(`${getApiBase()}/brands`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
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
  /** In-stock, visible listings in this category or any descendant (subtree rollup). */
  deal_count: number;
  /**
   * Distinct product groups in this subtree (matches `GET /deals?group_variants=true` totals).
   * When missing (older API), fall back to `deal_count` for display.
   */
  product_count?: number;
  children: CategoryTreeNode[];
}

export async function fetchCategoryTree(): Promise<CategoryTreeNode[]> {
  const res = await fetch(`${getApiBase()}/categories/tree`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch category tree");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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

export interface FacetsResponse {
  spec_facets: SpecFacet[];
  brand_facets: BrandFacet[];
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
    price_range: base.price_range ?? EMPTY_FACETS.price_range,
    total_matching: base.total_matching ?? 0,
  };
}

export interface FacetsParams {
  store?: string;
  brands?: string[];
  category?: string;
  category_slug?: string;
  canonical_category?: string;
  min_discount?: number;
  min_price?: number;
  max_price?: number;
  q?: string;
  specFilters?: Record<string, string[]>;
}

export async function fetchFacets(
  params?: FacetsParams,
): Promise<FacetsResponse> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brands?.length) {
    for (const b of params.brands) {
      const t = b.trim();
      if (t) search.append("brand", t);
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
  const res = await fetch(`${getApiBase()}/facets${qs ? `?${qs}` : ""}`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
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
  const res = await fetch(`${getApiBase()}/status`, {
    next: { revalidate: PUBLIC_ISR_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}
