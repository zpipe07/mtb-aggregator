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

/** Trigger enrichment; pass force=true to re-enrich all. */
export async function triggerEnrich(force?: boolean): Promise<void> {
  const url = force ? `${API_BASE}/enrich-now?force=1` : `${API_BASE}/enrich-now`;
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
