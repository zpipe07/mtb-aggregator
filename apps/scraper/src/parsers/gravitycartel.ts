import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import * as cheerio from "cheerio";
import { SCRAPER_MAX_PRODUCTS } from "../config.js";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
  resolveShopifyCategoryPath,
} from "./shopify-helpers.js";

const BASE_URL = "https://thegravitycartel.com";
const PER_PAGE = 250;

type ShopifyVariant = ShopifyVariantWithOptions;
type ShopifyProduct = ShopifyProductWithOptions;

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
async function fetchPage(
  collectionUrl: string,
  page: number,
): Promise<ShopifyProduct[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const pathname = url.pathname.replace(/\/$/, "");
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
 * Scrape The Gravity Cartel sale collection via Shopify products.json API.
 * Only emits in-stock variants — the sale page lists many sold-out SKUs.
 */
export async function scrapeGravityCartel(
  collectionUrl: string,
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const origin = new URL(collectionUrl).origin;

  let page = 1;
  while (true) {
    const products = await fetchPage(collectionUrl, page);
    if (products.length === 0) break;

    for (const product of products) {
      if (!product.variants || product.variants.length === 0) continue;

      for (const variant of product.variants) {
        if (!variant.available) continue;

        const currentPrice = parseFloat(variant.price);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        const originalPrice = variant.compare_at_price
          ? parseFloat(variant.compare_at_price)
          : null;
        if (
          originalPrice !== null &&
          (!Number.isFinite(originalPrice) || originalPrice <= 0)
        ) {
          continue;
        }

        const productUrl = `${origin}/products/${product.handle}`;
        const imageUrl =
          variant.featured_image?.src ?? product.images?.[0]?.src ?? null;
        const storeSku = variant.sku?.trim() || `v${variant.id}`;
        const categoryPath = product.product_type
          ? [product.product_type]
          : null;
        const variantOpts = buildVariantOptions(product, variant);

        results.push({
          store_sku: storeSku,
          product_name: product.title,
          current_price: currentPrice,
          original_price: originalPrice ?? null,
          product_url: productUrl,
          image_url: imageUrl,
          brand: product.vendor || null,
          category_path: categoryPath,
          is_in_stock: true,
          product_group_key: product.handle,
          ...(variantOpts ? { variant_options: variantOpts } : {}),
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

  const deduped = dedupeBySku(results);
  console.log(
    `[scraper] The Gravity Cartel: ${deduped.length} listings (${page} page(s))`,
  );
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
 * Enrich a single Gravity Cartel product using Shopify's /products/{handle}.json API.
 */
export async function enrichGravityCartel(
  productUrl: string,
): Promise<EnrichResult> {
  try {
    const [detail, html] = await Promise.all([
      fetchGravityCartelProductDetail(productUrl),
      fetchGravityCartelProductHtml(productUrl),
    ]);
    const rawSpecs = detail.body_html
      ? extractSpecsFromHtml(detail.body_html)
      : null;
    const categoryPath = resolveShopifyCategoryPath(detail.product_type, html);
    const description = detail.body_html
      ? extractDescriptionFromHtml(detail.body_html)
      : null;
    return {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description: description ?? undefined,
    };
  } catch (err) {
    console.error("[scraper] The Gravity Cartel enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}

async function fetchGravityCartelProductDetail(
  productUrl: string,
): Promise<ShopifyProductDetail> {
  const url = new URL(productUrl);
  const origin = url.origin || BASE_URL;
  const parts = url.pathname.split("/").filter(Boolean);
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

async function fetchGravityCartelProductHtml(
  productUrl: string,
): Promise<string | null> {
  const res = await fetch(productUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  });
  if (!res.ok) return null;
  return res.text();
}

function extractDescriptionFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const clone = $.root().clone();
  clone.find("table, dl").remove();
  const text = clone.text().replace(/\s+/g, " ").trim();
  if (!text || text.length < 50) return null;
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

function extractSpecsFromHtml(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};

  const clean = (text: string | null | undefined): string =>
    (text || "").replace(/\s+/g, " ").trim();

  function collectFromTable(table: cheerio.Cheerio<any>) {
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

  function collectFromDl(dl: cheerio.Cheerio<any>) {
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

  $("table").each((_, el) => {
    const table = $(el);
    const heading = clean(
      table.prevAll("h1,h2,h3,h4,strong").first().text(),
    ).toLowerCase();
    const isSpecTable =
      heading.includes("spec") ||
      heading.includes("item specifications") ||
      heading.includes("details");
    if (isSpecTable) {
      collectFromTable(table);
    }
  });

  if (Object.keys(specs).length === 0) {
    $("table").each((_, el) => {
      collectFromTable($(el));
    });
  }

  if (Object.keys(specs).length === 0) {
    $("dl").each((_, el) => {
      const dl = $(el);
      const heading = clean(
        dl.prevAll("h1,h2,h3,h4,strong").first().text(),
      ).toLowerCase();
      if (heading.includes("spec")) {
        collectFromDl(dl);
      }
    });
  }

  return Object.keys(specs).length > 0 ? specs : null;
}
