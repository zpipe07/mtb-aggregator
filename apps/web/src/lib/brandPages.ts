/** Minimum in-stock deals to index a brand or brand+category page. */
export const SEO_BRAND_MIN_INDEXABLE_DEALS = 3;

/** URL-safe slug from a brand display name (e.g. "RockShox" → "rockshox"). */
export function brandToSlug(brand: string): string {
  return brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve canonical brand label from slug using the live brand list. */
export function resolveBrandFromSlug(
  slug: string,
  brands: string[],
): string | undefined {
  const target = slug.trim().toLowerCase();
  if (!target) return undefined;
  return brands.find((b) => brandToSlug(b) === target);
}

export function buildBrandDealsPath(brandSlug: string): string {
  return `/deals/brand/${brandSlug.trim()}`;
}

export function buildBrandCategoryDealsPath(
  brandSlug: string,
  categoryPath: string,
): string {
  const cat = categoryPath.startsWith("/") ? categoryPath.slice(1) : categoryPath;
  return `/deals/brand/${brandSlug.trim()}/c/${cat.replace(/^deals\/c\//, "")}`;
}

export function brandMeetsIndexThreshold(totalCount: number): boolean {
  return totalCount >= SEO_BRAND_MIN_INDEXABLE_DEALS;
}

export type BrandFacetCount = { value: string; count: number };

/**
 * Brand sitemap candidates: facet count meets the index threshold, one URL per
 * slug (duplicate labels like SRAM/Sram collapse), first-seen wins.
 * Callers still probe grouped `GET /deals` counts before emitting a loc.
 */
export function uniqueBrandSitemapCandidates(
  facets: BrandFacetCount[],
): { value: string; slug: string; count: number }[] {
  const seen = new Set<string>();
  const out: { value: string; slug: string; count: number }[] = [];
  for (const b of facets) {
    if (!brandMeetsIndexThreshold(b.count)) continue;
    const slug = brandToSlug(b.value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ value: b.value, slug, count: b.count });
  }
  return out;
}
