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

export async function fetchDeals(params?: {
  store?: string;
  brand?: string;
  category?: string;
  min_discount?: number;
  limit?: number;
  offset?: number;
}): Promise<Deal[]> {
  const search = new URLSearchParams();
  if (params?.store) search.set("store", params.store);
  if (params?.brand) search.set("brand", params.brand);
  if (params?.category) search.set("category", params.category);
  if (params?.min_discount != null) search.set("min_discount", String(params.min_discount));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const url = `${API_BASE}/deals${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch deals");
  return res.json();
}

export async function fetchDeal(id: number): Promise<Deal> {
  const res = await fetch(`${API_BASE}/deals/${id}`);
  if (!res.ok) throw new Error("Failed to fetch deal");
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
