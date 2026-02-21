import type { ScrapeResult } from "../types.js";

const BASE_URL = "https://worldwidecyclery.com";
const PER_PAGE = 250;

interface ShopifyVariant {
  id: number;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  featured_image?: { src: string } | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  variants: ShopifyVariant[];
  images?: { src: string }[];
}

interface ShopifyCollectionResponse {
  products: ShopifyProduct[];
}

/**
 * Fetch one page of products from Shopify collection JSON API.
 */
async function fetchPage(collectionUrl: string, page: number): Promise<ShopifyProduct[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const pathname = url.pathname.replace(/\/$/, "");
  // Shopify: /collections/deals -> /collections/deals/products.json
  const jsonUrl = `${origin}${pathname}/products.json?limit=${PER_PAGE}&page=${page}`;

  const res = await fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  });
  if (!res.ok) {
    throw new Error(`products.json ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as ShopifyCollectionResponse;
  return data.products ?? [];
}

/**
 * Scrape Worldwide Cyclery deals via Shopify's collection products.json API.
 * No browser required; uses fetch + JSON.
 */
export async function scrapeWorldwideCyclery(collectionUrl: string): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const url = new URL(collectionUrl);
  const origin = url.origin;

  let page = 1;
  while (true) {
    const products = await fetchPage(collectionUrl, page);
    if (products.length === 0) break;

    for (const product of products) {
      if (!product.variants || product.variants.length === 0) continue;

      for (const variant of product.variants) {
        const currentPrice = parseFloat(variant.price);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        const originalPrice = variant.compare_at_price
          ? parseFloat(variant.compare_at_price)
          : null;
        if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) {
          continue;
        }

        const productUrl = `${origin}/products/${product.handle}`;
        const imageUrl =
          variant.featured_image?.src ??
          product.images?.[0]?.src ??
          null;
        const storeSku = variant.sku?.trim() || `v${variant.id}`;
        const categoryPath = product.product_type ? [product.product_type] : null;

        results.push({
          store_sku: storeSku,
          product_name: product.title,
          current_price: currentPrice,
          original_price: originalPrice ?? null,
          product_url: productUrl,
          image_url: imageUrl,
          brand: product.vendor || null,
          category_path: categoryPath,
          is_in_stock: variant.available,
        });
      }
    }

    if (products.length < PER_PAGE) break;
    page++;
  }

  const deduped = dedupeBySku(results);
  console.log(`[scraper] Worldwide Cyclery: ${deduped.length} listings (${page} page(s))`);
  return deduped;
}

function dedupeBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.store_sku)) return false;
    seen.add(r.store_sku);
    return true;
  });
}
