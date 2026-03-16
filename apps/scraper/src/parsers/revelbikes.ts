import type { ScrapeResult } from "../types.js";
import { SCRAPER_MAX_PRODUCTS } from "../config.js";

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

function fetchPage(collectionUrl: string, page: number): Promise<ShopifyProduct[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const pathname = url.pathname.replace(/\/$/, "");
  const jsonUrl = `${origin}${pathname}/products.json?limit=${PER_PAGE}&page=${page}`;

  return fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`products.json ${res.status}: ${res.statusText}`);
    const data = (await res.json()) as ShopifyCollectionResponse;
    return data.products ?? [];
  });
}

/**
 * Scrape Revel Bikes "The Boneyard" sale collection via Shopify's products.json API.
 * No browser required; uses fetch + JSON.
 */
export async function scrapeRevelBikes(collectionUrl: string): Promise<ScrapeResult[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const results: ScrapeResult[] = [];
  let page = 1;

  while (true) {
    const products = await fetchPage(collectionUrl, page);
    if (products.length === 0) break;

    for (const product of products) {
      if (!product.variants?.length) continue;

      for (const variant of product.variants) {
        const currentPrice = parseFloat(variant.price);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        const originalPrice = variant.compare_at_price
          ? parseFloat(variant.compare_at_price)
          : null;
        if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) continue;

        const productUrl = `${origin}/products/${product.handle}`;
        const imageUrl = variant.featured_image?.src ?? product.images?.[0]?.src ?? null;
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
        if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
          break;
      }
      if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
        break;
    }

    if (products.length < PER_PAGE) break;
    if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
      break;
    page++;
  }

  const deduped = results.filter((r, i, arr) => arr.findIndex((x) => x.store_sku === r.store_sku) === i);
  console.log(`[scraper] Revel Bikes: ${deduped.length} listings (${page} page(s))`);
  return deduped;
}
