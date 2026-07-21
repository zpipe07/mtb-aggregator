import type { Page } from "playwright";
import * as cheerio from "cheerio";
import { runWithBrowser } from "../browser.js";
import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
} from "./shopify-helpers.js";

const BASE_URL = "https://www.evo.com";
const PER_PAGE = 250;
const EVO_PAGE_DELAY_MS = Math.max(
  0,
  Number(process.env.EVO_PAGE_DELAY_MS) || 500,
);
const EVO_WARMUP_MS = Math.max(0, Number(process.env.EVO_WARMUP_MS) || 2000);

type ShopifyVariant = ShopifyVariantWithOptions;
type ShopifyProduct = ShopifyProductWithOptions & { tags?: string[] };

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

async function fetchViaBrowser(
  page: Page,
  url: string,
  accept: string,
): Promise<{ status: number; text: string }> {
  return page.evaluate(
    async ({ targetUrl, acceptHeader }) => {
      const res = await fetch(targetUrl, {
        headers: { Accept: acceptHeader },
      });
      return { status: res.status, text: await res.text() };
    },
    { targetUrl: url, acceptHeader: accept },
  );
}

async function fetchJsonViaBrowser<T>(
  page: Page,
  url: string,
  label: string,
): Promise<T> {
  const res = await fetchViaBrowser(page, url, "application/json");
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${label} ${res.status}`);
  }
  return JSON.parse(res.text) as T;
}

/** Exclude gift cards and similar non-catalog items. */
function isExcludedProduct(product: ShopifyProduct): boolean {
  if (/gift\s*card/i.test(product.title)) return true;
  if (product.product_type && /gift\s*card/i.test(product.product_type))
    return true;
  return false;
}

function dedupeBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.store_sku)) return false;
    seen.add(r.store_sku);
    return true;
  });
}

export function mapEvoProductsToResults(
  products: ShopifyProduct[],
  origin: string,
): ScrapeResult[] {
  const results: ScrapeResult[] = [];

  for (const product of products) {
    if (!product.variants || product.variants.length === 0) continue;
    if (isExcludedProduct(product)) continue;

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

  return results;
}

/**
 * Scrape Evo bike sale via Shopify collection products.json.
 * Cloudflare blocks plain fetch; uses Playwright to establish a session first.
 */
export async function scrapeEvo(
  collectionUrl: string,
): Promise<ScrapeResult[]> {
  return runWithBrowser(async (browser) => {
    const context = await browser.newContext({
      userAgent: BROWSER_USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      const url = new URL(collectionUrl);
      const origin = url.origin;
      const pathname = url.pathname.replace(/\/$/, "");
      const warmupUrl = `${origin}${pathname}`;

      await page.goto(warmupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      if (EVO_WARMUP_MS > 0) await sleep(EVO_WARMUP_MS);

      const results: ScrapeResult[] = [];
      let pageNum = 1;

      while (true) {
        if (pageNum > 1 && EVO_PAGE_DELAY_MS > 0) {
          await sleep(EVO_PAGE_DELAY_MS);
        }

        const jsonUrl = `${origin}${pathname}/products.json?limit=${PER_PAGE}&page=${pageNum}`;
        const data = await fetchJsonViaBrowser<ShopifyCollectionResponse>(
          page,
          jsonUrl,
          `products.json page=${pageNum}`,
        );
        const products = data.products ?? [];
        if (products.length === 0) break;

        results.push(...mapEvoProductsToResults(products, origin));

        if (products.length < PER_PAGE) break;
        if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
          break;
        pageNum++;
      }

      const deduped = dedupeBySku(results);
      console.log(
        `[scraper] Evo: ${deduped.length} listings (${pageNum} page(s))`,
      );
      return deduped;
    } finally {
      await context.close();
    }
  });
}

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
 * Enrich a single Evo product using Shopify product.json + PDP HTML.
 */
export async function enrichEvo(productUrl: string): Promise<EnrichResult> {
  try {
    const handle = extractHandleFromProductUrl(productUrl);
    if (!handle) {
      return { category_path: null, raw_specs: null };
    }

    const url = new URL(productUrl);
    const origin = url.origin || BASE_URL;

    return await runWithBrowser(async (browser) => {
      const context = await browser.newContext({
        userAgent: BROWSER_USER_AGENT,
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      try {
        await page.goto(productUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        if (EVO_WARMUP_MS > 0) await sleep(EVO_WARMUP_MS);

        const [detailRes, htmlRes] = await Promise.all([
          fetchViaBrowser(
            page,
            `${origin}/products/${handle}.json`,
            "application/json",
          ),
          fetchViaBrowser(page, productUrl, "text/html"),
        ]);

        const detail: ShopifyProductDetail =
          detailRes.status >= 200 && detailRes.status < 300
            ? ((JSON.parse(detailRes.text) as ShopifyProductDetailResponse)
                .product ?? {})
            : {};

        const html =
          htmlRes.status >= 200 && htmlRes.status < 300 ? htmlRes.text : null;

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
      } finally {
        await context.close();
      }
    });
  } catch (err) {
    console.error("[scraper] Evo enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}

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

  return null;
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
