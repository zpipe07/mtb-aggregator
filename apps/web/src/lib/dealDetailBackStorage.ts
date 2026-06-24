/** sessionStorage key for deal detail "Back to deals" context (avoids `?from=` in URLs). */
export const DEAL_DETAIL_BACK_HREF_KEY = "dropper:dealDetailBackHref";

export function storeDealDetailBackHref(href: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DEAL_DETAIL_BACK_HREF_KEY, href);
  } catch {
    // private browsing / quota
  }
}

export function readDealDetailBackHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(DEAL_DETAIL_BACK_HREF_KEY);
  } catch {
    return null;
  }
}
