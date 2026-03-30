const DEALS_CATEGORY_PREFIX = "/deals/c";

/** Public URL path for a category slug (e.g. `bikes-electric` → `/deals/c/bikes/electric`). */
export function buildDealsCategoryPath(categorySlug: string): string {
  const s = categorySlug.trim();
  if (!s) return "/deals";
  return `${DEALS_CATEGORY_PREFIX}/${s.split("-").join("/")}`;
}

/**
 * Parse category slug from pathname when under `/deals/c/...`.
 * Returns `null` for `/deals`, `/deals/123`, or invalid `/deals/c` without segments.
 */
export function parseCategorySlugFromDealsPath(pathname: string): string | null {
  if (!pathname.startsWith(`${DEALS_CATEGORY_PREFIX}/`)) return null;
  const rest = pathname.slice(DEALS_CATEGORY_PREFIX.length + 1);
  if (!rest) return null;
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return segments.join("-");
}
