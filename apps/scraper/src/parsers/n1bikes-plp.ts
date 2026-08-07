import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

export const N1_ORIGIN = "https://www.n1bikes.com";
export const N1_ACCOUNT_CODE = "LKY";
export const N1_CATALOG_SEARCH_URL =
  "https://storefrontapi.masterlinq.io/api/ecom/catalog/search";

const MAX_CATALOG_PAGES = 100;

export interface N1VariantOption {
  key: string;
  value: string;
}

export interface N1CatalogVariant {
  id: string;
  sku: string;
  title: string;
  map?: string | null;
  msrp?: string | null;
  vendor?: string | null;
  type?: string | null;
  options?: N1VariantOption[];
  images?: Record<string, string[]>;
}

export interface N1CatalogGroup {
  id: string;
  title: string;
  variants: N1CatalogVariant[];
}

export interface N1CatalogItem {
  id: string;
  group: N1CatalogGroup;
  extractedType?: string | null;
  totalInventoryByProduct?: Record<string, Record<string, number>>;
}

export interface N1CatalogSearchResponse {
  items: N1CatalogItem[];
  continuationToken?: string | null;
}

export function slugifyN1ProductTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/%/g, "-percent-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse `discount=0.2` from category PLP URLs (defaults to 20% when absent). */
export function parseDiscountThresholdFromUrl(url: string): number {
  try {
    const raw = new URL(url, N1_ORIGIN).searchParams.get("discount");
    if (!raw) return 0.2;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.2;
  } catch {
    return 0.2;
  }
}

export function parseN1Price(raw: string | null | undefined): number | null {
  if (!raw || raw === "$undefined") return null;
  const n = parseFloat(String(raw).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildN1ProductUrl(groupId: string, title: string): string {
  const slug = slugifyN1ProductTitle(title);
  const u = new URL(`/products/${slug}`, N1_ORIGIN);
  u.searchParams.set("id", groupId);
  return u.toString();
}

export function variantOptionsFromN1(
  options: N1VariantOption[] | undefined,
): Record<string, string> | null {
  if (!options?.length) return null;
  const out: Record<string, string> = {};
  for (const opt of options) {
    const key = opt.key?.trim();
    const value = opt.value?.trim();
    if (key && value) {
      out[key.charAt(0).toUpperCase() + key.slice(1)] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function firstN1ImageUrl(
  images: Record<string, string[]> | undefined,
): string | null {
  if (!images) return null;
  for (const urls of Object.values(images)) {
    const first = urls?.[0];
    if (first?.startsWith("http")) return first;
  }
  return null;
}

/** Sum supplier warehouse inventory (QBP*, etc.) for online availability. */
export function variantSupplierStock(
  item: N1CatalogItem,
  variantId: string,
): number {
  const locs = item.totalInventoryByProduct?.[variantId];
  if (!locs) return 0;
  return Object.values(locs).reduce(
    (sum, qty) => sum + (Number.isFinite(Number(qty)) ? Number(qty) : 0),
    0,
  );
}

export function isN1VariantOnSale(
  currentPrice: number,
  originalPrice: number,
  minDiscount: number,
): boolean {
  if (currentPrice >= originalPrice) return false;
  const discount = 1 - currentPrice / originalPrice;
  return discount + 1e-6 >= minDiscount;
}

export function parseN1CatalogItemsToResults(
  items: N1CatalogItem[],
  minDiscount: number,
): ScrapeResult[] {
  const results: ScrapeResult[] = [];

  for (const item of items) {
    const group = item.group;
    if (!group?.variants?.length) continue;

    const productUrl = buildN1ProductUrl(group.id, group.title);
    const categoryFromType =
      item.extractedType?.trim() ||
      group.variants.find((v) => v.type?.trim())?.type?.trim() ||
      null;
    const category_path = categoryFromType ? [categoryFromType] : null;

    for (const variant of group.variants) {
      const currentPrice = parseN1Price(variant.map);
      const originalPrice = parseN1Price(variant.msrp);
      if (currentPrice === null || originalPrice === null) continue;
      if (!isN1VariantOnSale(currentPrice, originalPrice, minDiscount)) continue;

      const storeSku = variant.sku?.trim() || variant.id;
      if (!storeSku) continue;

      results.push({
        store_sku: storeSku,
        product_name: group.title.trim(),
        current_price: currentPrice,
        original_price: originalPrice,
        product_url: productUrl,
        image_url: firstN1ImageUrl(variant.images),
        brand: variant.vendor?.trim() || null,
        category_path,
        is_in_stock: variantSupplierStock(item, variant.id) > 0,
        product_group_key: group.id,
        variant_options: variantOptionsFromN1(variant.options),
      });
    }
  }

  return results;
}

export async function fetchN1CatalogSearchPage(
  body: Record<string, unknown>,
): Promise<N1CatalogSearchResponse> {
  const res = await fetch(N1_CATALOG_SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Referer: `${N1_ORIGIN}/`,
      "x-account-code": N1_ACCOUNT_CODE,
      "User-Agent": BROWSER_USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`N+1 catalog search ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as N1CatalogSearchResponse;
}

export async function scrapeN1BikesSalePl(url: string): Promise<ScrapeResult[]> {
  const minDiscount = parseDiscountThresholdFromUrl(url);
  const results: ScrapeResult[] = [];
  let continuationToken: string | undefined;
  let pageCount = 0;

  while (pageCount < MAX_CATALOG_PAGES) {
    pageCount++;
    const body: Record<string, unknown> = { discountAtOrAbove: minDiscount };
    if (continuationToken) body.continuationToken = continuationToken;

    const page = await fetchN1CatalogSearchPage(body);
    const pageResults = parseN1CatalogItemsToResults(page.items ?? [], minDiscount);
    results.push(...pageResults);

    if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS) {
      return results.slice(0, SCRAPER_MAX_PRODUCTS);
    }

    continuationToken = page.continuationToken?.trim() || undefined;
    if (!continuationToken || !page.items?.length) break;
  }

  return results;
}
