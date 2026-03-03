const API_BASE = import.meta.env.VITE_API_URL || "/api";

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
  brand?: string;
  category?: string;
  canonical_category?: string;
  min_discount?: number;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  spec_key?: string;
  spec_value?: string;
}): Promise<DealListResponse> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brand) search.set("brand", params.brand);
  if (params?.category) search.set("category", params.category);
  if (params?.canonical_category) search.set("canonical_category", params.canonical_category);
  if (params?.min_discount != null) search.set("min_discount", String(params.min_discount));
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.spec_key) search.set("spec_key", params.spec_key);
  if (params?.spec_value) search.set("spec_value", params.spec_value);
  const qs = search.toString();
  const url = `${API_BASE}/deals${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch deals");
  const data = await res.json();
  return {
    deals: Array.isArray(data.deals) ? data.deals : [],
    total_count: typeof data.total_count === "number" ? data.total_count : 0,
  };
}

export { DEFAULT_PAGE_SIZE };

export async function fetchDeal(id: number): Promise<Deal> {
  const res = await fetch(`${API_BASE}/deals/${id}`);
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

export async function fetchPriceHistory(dealId: number): Promise<PriceHistoryResponse> {
  const res = await fetch(`${API_BASE}/deals/${dealId}/price-history`);
  if (!res.ok) throw new Error("Failed to fetch price history");
  return res.json();
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch(`${API_BASE}/stores`);
  if (!res.ok) throw new Error("Failed to fetch stores");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchBrands(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/brands`);
  if (!res.ok) throw new Error("Failed to fetch brands");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Canonical category paths for faceted filter, e.g. ["Bikes > Mountain", "Components > Brakes"] */
export async function fetchCanonicalCategories(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/canonical-categories`);
  if (!res.ok) throw new Error("Failed to fetch canonical categories");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Distinct spec values for a given metadata key, e.g. "material" or "tooth_count". */
export async function fetchSpecValues(key: string): Promise<string[]> {
  const search = new URLSearchParams();
  search.set("key", key);
  const res = await fetch(`${API_BASE}/spec-values?${search.toString()}`);
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
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}
