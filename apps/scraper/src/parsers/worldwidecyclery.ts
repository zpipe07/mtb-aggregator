import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import * as cheerio from "cheerio";

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

interface ShopifyProductDetail {
  body_html?: string;
  product_type?: string;
}

interface ShopifyProductDetailResponse {
  product?: ShopifyProductDetail;
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

/**
 * Enrich a single Worldwide Cyclery product using Shopify's /products/{handle}.json API.
 * Extracts specs from body_html tables/definition lists and returns them as raw key-value pairs.
 * Category breadcrumbs are not updated here (we rely on product_type from the scrape).
 */
export async function enrichWorldwideCyclery(productUrl: string): Promise<EnrichResult> {
  try {
    const detail = await fetchWorldwideProductDetail(productUrl);
    const rawSpecs = detail.body_html ? extractSpecsFromHtml(detail.body_html) : null;
    // We don't currently extract breadcrumb categories for WWC; keep category_path unchanged by returning null.
    return {
      category_path: null,
      raw_specs: rawSpecs,
    };
  } catch (err) {
    console.error("[scraper] Worldwide Cyclery enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}

async function fetchWorldwideProductDetail(productUrl: string): Promise<ShopifyProductDetail> {
  const url = new URL(productUrl);
  const origin = url.origin || BASE_URL;
  const parts = url.pathname.split("/").filter(Boolean);
  // Expect /products/{handle}
  const handle = parts[parts.length - 1];
  const jsonUrl = `${origin}/products/${handle}.json`;

  const res = await fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  });
  if (!res.ok) {
    throw new Error(`product.json ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as ShopifyProductDetailResponse;
  return data.product ?? {};
}

function extractSpecsFromHtml(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};

  const clean = (text: string | null | undefined): string =>
    (text || "").replace(/\s+/g, " ").trim();

  function collectFromTable(table: cheerio.Cheerio<cheerio.Element>) {
    table.find("tr").each((_, row) => {
      const cells = $(row).children("th,td");
      if (cells.length < 2) return;
      const key = clean($(cells[0]).text());
      const value = clean($(cells[1]).text());
      if (!key || !value) return;
      if (key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  function collectFromDl(dl: cheerio.Cheerio<cheerio.Element>) {
    dl.find("dt").each((_, el) => {
      const term = $(el);
      const def = term.next("dd");
      const key = clean(term.text());
      const value = clean(def.text());
      if (!key || !value) return;
      if (key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  // Prefer tables that are clearly labeled as specifications
  $("table").each((_, el) => {
    const table = $(el);
    const heading = clean(
      table
        .prevAll("h1,h2,h3,h4,strong")
        .first()
        .text(),
    ).toLowerCase();
    const isSpecTable =
      heading.includes("spec") || heading.includes("item specifications") || heading.includes("details");
    if (isSpecTable) {
      collectFromTable(table);
    }
  });

  // Fallback: any table with many short key/value rows
  if (Object.keys(specs).length === 0) {
    $("table").each((_, el) => {
      collectFromTable($(el));
    });
  }

  // Fallback: definition lists near a specs heading
  if (Object.keys(specs).length === 0) {
    $("dl").each((_, el) => {
      const dl = $(el);
      const heading = clean(
        dl
          .prevAll("h1,h2,h3,h4,strong")
          .first()
          .text(),
      ).toLowerCase();
      if (heading.includes("spec")) {
        collectFromDl(dl);
      }
    });
  }

  return Object.keys(specs).length > 0 ? specs : null;
}
