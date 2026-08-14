/**
 * 308 redirects after migration 037 flattened Gear > Clothing (removed Tops/Bottoms).
 * Old slugs and `/deals/c/...` paths → new canonical paths.
 */

const DEALS_CATEGORY_PREFIX = "/deals/c";

/** Old category slug → new slug (empty string = Clothing parent). */
export const CLOTHING_CATEGORY_SLUG_REDIRECTS: Record<string, string> = {
  "gear-clothing-tops": "gear-clothing",
  "gear-clothing-bottoms": "gear-clothing",
  "gear-clothing-tops-jerseys": "gear-clothing-jerseys",
  "gear-clothing-tops-jackets": "gear-clothing-jackets",
  "gear-clothing-tops-shirts": "gear-clothing-shirts",
  "gear-clothing-bottoms-shorts": "gear-clothing-shorts",
  "gear-clothing-bottoms-pants": "gear-clothing-pants",
};

/** Old `/deals/c/...` pathname → new pathname (query string preserved by caller). */
export const CLOTHING_DEALS_PATH_REDIRECTS: Record<string, string> = {
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/tops`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/bottoms`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/tops/jerseys`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing/jerseys`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/tops/jackets`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing/jackets`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/tops/shirts`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing/shirts`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/bottoms/shorts`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing/shorts`,
  [`${DEALS_CATEGORY_PREFIX}/gear/clothing/bottoms/pants`]: `${DEALS_CATEGORY_PREFIX}/gear/clothing/pants`,
};

/**
 * Resolve a legacy clothing category slug to its replacement, or null if unchanged.
 */
export function redirectClothingCategorySlug(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  if (Object.prototype.hasOwnProperty.call(CLOTHING_CATEGORY_SLUG_REDIRECTS, trimmed)) {
    return CLOTHING_CATEGORY_SLUG_REDIRECTS[trimmed];
  }
  return null;
}

/**
 * Resolve a legacy `/deals/c/...` pathname to its replacement, or null if unchanged.
 */
export function redirectClothingDealsPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || pathname;
  if (Object.prototype.hasOwnProperty.call(CLOTHING_DEALS_PATH_REDIRECTS, normalized)) {
    return CLOTHING_DEALS_PATH_REDIRECTS[normalized];
  }
  return null;
}
