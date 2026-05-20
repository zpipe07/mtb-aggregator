import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import * as cheerio from "cheerio";
import { SCRAPER_MAX_PRODUCTS } from "../config.js";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
} from "./shopify-helpers.js";

const BASE_URL = "https://www.mackcycle.com";
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
 * Scrape Mack Cycle deals via Shopify's collection products.json API.
 * No browser required; uses fetch + JSON.
 */
export async function scrapeMackCycle(
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
          is_in_stock: variant.available,
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
    `[scraper] Mack Cycle: ${deduped.length} listings (${page} page(s))`,
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
 * Enrich a single Mack Cycle product using Shopify's /products/{handle}.json API.
 * Extracts specs from body_html tables/definition lists and returns them as raw key-value pairs.
 * Extracts category breadcrumbs from the product page HTML (JSON-LD, DOM, or collection links).
 */
export async function enrichMackCycle(
  productUrl: string,
): Promise<EnrichResult> {
  try {
    const [detail, html] = await Promise.all([
      fetchMackCycleProductDetail(productUrl),
      fetchMackCycleProductHtml(productUrl),
    ]);
    const rawSpecs = detail.body_html
      ? extractSpecsFromHtml(detail.body_html)
      : null;
    const categoryPath = html ? extractBreadcrumbsFromHtml(html) : null;
    const description = detail.body_html
      ? extractDescriptionFromHtml(detail.body_html)
      : null;
    return {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description: description ?? undefined,
    };
  } catch (err) {
    console.error("[scraper] Mack Cycle enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}

async function fetchMackCycleProductDetail(
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

async function fetchMackCycleProductHtml(
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

/**
 * Extract category breadcrumbs from product page HTML.
 * Tries: (1) JSON-LD BreadcrumbList, (2) DOM breadcrumb links, (3) Collection links section.
 */
function extractBreadcrumbsFromHtml(html: string): string[] | null {
  const $ = cheerio.load(html);
  const clean = (text: string | null | undefined): string =>
    (text || "").replace(/\s+/g, " ").trim();

  let result: string[] | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    try {
      const parsed = JSON.parse($(el).html() ?? "{}");
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"]
          ? parsed["@graph"]
          : [parsed];
      for (const json of candidates) {
        if (
          json?.["@type"] === "BreadcrumbList" &&
          Array.isArray(json.itemListElement)
        ) {
          const items: string[] = [];
          for (const el2 of json.itemListElement) {
            const name = el2.name ?? el2.item?.name;
            if (name) items.push(clean(String(name)));
          }
          if (items.length >= 2) {
            let trimmed = items.slice(0, -1);
            if (trimmed[0] && /^home$/i.test(trimmed[0]))
              trimmed = trimmed.slice(1);
            if (trimmed.length > 0) {
              result = trimmed;
              return;
            }
          }
        }
      }
    } catch {
      /* ignore parse errors */
    }
  });
  if (result) return result;

  const breadcrumbSelectors = [
    'nav[aria-label="Breadcrumb"] a',
    'nav[aria-label="breadcrumb"] a',
    ".breadcrumb a",
    ".breadcrumbs a",
    "[class*='breadcrumb'] a",
    "ol[class*='breadcrumb'] li a",
  ];
  for (const sel of breadcrumbSelectors) {
    const items: string[] = [];
    $(sel).each((_, el) => {
      const t = clean($(el).text());
      if (t) items.push(t);
    });
    if (items.length >= 2) {
      let trimmed = items.slice(0, -1);
      if (trimmed[0] && /^home$/i.test(trimmed[0])) trimmed = trimmed.slice(1);
      if (trimmed.length > 0) return trimmed;
    }
  }

  const collectionsLabel = $('*:contains("Collections:")').first();
  if (collectionsLabel.length) {
    const container = collectionsLabel.closest("motion.div, div, section, p");
    const links = (container.length ? container : collectionsLabel).find(
      "a[href*='/collections/']",
    );
    const items: string[] = [];
    links.each((_, el) => {
      const t = clean($(el).text());
      if (t && t.length < 100) items.push(t);
    });
    if (items.length > 0) {
      const best = items.reduce((a, b) => (a.length >= b.length ? a : b));
      const parts = best
        .split(/\s*\/\s*/)
        .map((p) => clean(p))
        .filter(Boolean);
      return parts.length > 0 ? parts : [best];
    }
  }

  return null;
}

/**
 * Extract description text from body_html by stripping spec tables/dl and returning
 * remaining text. Used for LLM spec extraction.
 */
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
