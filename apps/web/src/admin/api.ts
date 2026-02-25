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
