import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import * as cheerio from "cheerio";
import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
  isTrustedShopifyProductType,
  resolveShopifyCategoryPath,
} from "./shopify-helpers.js";

const BASE_URL = "https://ridebicycles.com";
const PER_PAGE = 250;
/** Minimum discount vs compare-at price (e.g. 0.15 = 15% off). */
const MIN_DISCOUNT_FRACTION = 0.15;
/** Delay between collection pages (ridebicycles.com rate-limits burst requests). */
const RIDEBICYCLES_PAGE_DELAY_MS = Math.max(
  0,
  Number(process.env.RIDEBICYCLES_PAGE_DELAY_MS) || 500,
);
const RIDEBICYCLES_FETCH_MAX_ATTEMPTS = 3;
const RIDEBICYCLES_RETRY_BASE_MS = 2000;
const RETRYABLE_HTTP_STATUS = new Set([403, 429, 503]);
/**
 * Maximum plausible discount fraction. Ride Bicycles uses compare_at_price on
 * some bulk/case variants to show the case price, not a "was" price — which
 * produces artificially extreme discounts (e.g. $1.49 spoke vs $88.79 box).
 * Anything above this threshold is almost certainly a data artifact, not a
 * real clearance sale.
 */
const MAX_DISCOUNT_FRACTION = 0.75;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP fetch for ridebicycles.com with browser-like UA, Referer, and retries on 403/429/503.
 */
async function fetchRideBicycles(
  url: string,
  accept: string,
  label: string,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 1; attempt <= RIDEBICYCLES_FETCH_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": BROWSER_USER_AGENT,
        Referer: `${BASE_URL}/`,
      },
    });
    if (res.ok) return res;
    lastRes = res;
    if (
      RETRYABLE_HTTP_STATUS.has(res.status) &&
      attempt < RIDEBICYCLES_FETCH_MAX_ATTEMPTS
    ) {
      await sleep(RIDEBICYCLES_RETRY_BASE_MS * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`${label} ${res.status}: ${res.statusText}`);
  }
  throw new Error(
    `${label} ${lastRes!.status}: ${lastRes!.statusText}`,
  );
}

/**
 * Fetch one page of products from Shopify collection JSON API.
 * Strips query params from collectionUrl to get base path (products.json ignores filter app params).
 */
async function fetchPage(
  collectionUrl: string,
  page: number,
): Promise<ShopifyProduct[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const pathname = url.pathname.replace(/\/$/, "");
  const jsonUrl = `${origin}${pathname}/products.json?limit=${PER_PAGE}&page=${page}`;

  const res = await fetchRideBicycles(
    jsonUrl,
    "application/json",
    `products.json page=${page}`,
  );
  const data = (await res.json()) as ShopifyCollectionResponse;
  return data.products ?? [];
}

/** Exclude gift cards and similar non-MTB items. */
function isGiftCard(product: ShopifyProduct): boolean {
  if (/gift\s*card/i.test(product.title)) return true;
  if (product.product_type && /gift\s*card/i.test(product.product_type))
    return true;
  return false;
}

/**
 * Scrape Ride Bicycles deals via Shopify's collection products.json API.
 * Filters for in-stock variants with compare-at price and at least 15% off (MIN_DISCOUNT_FRACTION; rb_stock_status/rb_discount_relative are not honored by API).
 * No browser required; uses fetch + JSON with browser-like headers and paced pagination.
 */
export async function scrapeRideBicycles(
  collectionUrl: string,
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const url = new URL(collectionUrl);
  const origin = url.origin;

  let page = 1;
  while (true) {
    if (page > 1 && RIDEBICYCLES_PAGE_DELAY_MS > 0) {
      await sleep(RIDEBICYCLES_PAGE_DELAY_MS);
    }
    const products = await fetchPage(collectionUrl, page);
    if (products.length === 0) break;

    for (const product of products) {
      if (!product.variants || product.variants.length === 0) continue;
      if (isGiftCard(product)) continue;

      for (const variant of product.variants) {
        if (!variant.available) continue;

        const currentPrice = parseFloat(variant.price);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        const compareAtPrice = variant.compare_at_price
          ? parseFloat(variant.compare_at_price)
          : null;
        if (
          compareAtPrice === null ||
          !Number.isFinite(compareAtPrice) ||
          compareAtPrice <= 0 ||
          compareAtPrice <= currentPrice
        ) {
          continue;
        }

        const maxPriceForMinDiscount =
          compareAtPrice * (1 - MIN_DISCOUNT_FRACTION);
        if (currentPrice > maxPriceForMinDiscount) continue;

        const minPriceForMaxDiscount =
          compareAtPrice * (1 - MAX_DISCOUNT_FRACTION);
        if (currentPrice < minPriceForMaxDiscount) continue;

        const productUrl = `${origin}/products/${product.handle}`;
        const imageUrl =
          variant.featured_image?.src ?? product.images?.[0]?.src ?? null;
        const storeSku = variant.sku?.trim() || `v${variant.id}`;
        const categoryPath = isTrustedShopifyProductType(product.product_type)
          ? [product.product_type.trim()]
          : null;
        const variantOpts = buildVariantOptions(product, variant);

        results.push({
          store_sku: storeSku,
          product_name: product.title,
          current_price: currentPrice,
          original_price: compareAtPrice,
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
    `[scraper] Ride Bicycles: ${deduped.length} listings (${page} page(s))`,
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
 * Extract product handle from PDP URL. Handles both:
 * - /collections/all-products/products/norco-fluid-fs-c2-29-2024?variant=...
 * - /products/norco-fluid-fs-c2-29-2024
 */
function extractHandleFromProductUrl(productUrl: string): string | null {
  const url = new URL(productUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const productsIdx = parts.indexOf("products");
  if (productsIdx >= 0 && productsIdx < parts.length - 1) {
    return parts[productsIdx + 1];
  }
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Enrich a single Ride Bicycles product using Shopify's /products/{handle}.json API.
 * Extracts specs from body_html tables and category breadcrumbs from HTML.
 */
export async function enrichRideBicycles(
  productUrl: string,
): Promise<EnrichResult> {
  try {
    const handle = extractHandleFromProductUrl(productUrl);
    if (!handle) {
      return { category_path: null, raw_specs: null };
    }

    const url = new URL(productUrl);
    const origin = url.origin || BASE_URL;

    const [detail, html] = await Promise.all([
      fetchProductDetail(origin, handle),
      fetchProductHtml(productUrl),
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
    console.error("[scraper] Ride Bicycles enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}

async function fetchProductDetail(
  origin: string,
  handle: string,
): Promise<ShopifyProductDetail> {
  const jsonUrl = `${origin}/products/${handle}.json`;

  const res = await fetchRideBicycles(
    jsonUrl,
    "application/json",
    `product.json handle=${handle}`,
  );
  const data = (await res.json()) as ShopifyProductDetailResponse;
  return data.product ?? {};
}

async function fetchProductHtml(productUrl: string): Promise<string | null> {
  try {
    const res = await fetchRideBicycles(
      productUrl,
      "text/html",
      "product.html",
    );
    return res.text();
  } catch {
    return null;
  }
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
      if (!key || !value || key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  function collectFromDl(dl: cheerio.Cheerio<any>) {
    dl.find("dt").each((_, el) => {
      const term = $(el);
      const def = term.next("dd");
      const key = clean(term.text());
      const value = clean(def.text());
      if (!key || !value || key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  // Spec tables: heading-based or Ride Bicycles' spec-table class
  $("table").each((_, el) => {
    const table = $(el);
    const heading = clean(
      table.prevAll("h1,h2,h3,h4,strong").first().text(),
    ).toLowerCase();
    const hasSpecClass = table.hasClass("spec-table");
    const isSpecTable =
      hasSpecClass ||
      heading.includes("spec") ||
      heading.includes("item specifications") ||
      heading.includes("details");
    if (isSpecTable) {
      collectFromTable(table);
    }
  });

  if (Object.keys(specs).length === 0) {
    $("table").each((_, el) => collectFromTable($(el)));
  }

  if (Object.keys(specs).length === 0) {
    $("dl").each((_, el) => {
      const dl = $(el);
      const heading = clean(
        dl.prevAll("h1,h2,h3,h4,strong").first().text(),
      ).toLowerCase();
      if (heading.includes("spec")) collectFromDl(dl);
    });
  }

  return Object.keys(specs).length > 0 ? specs : null;
}
