import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

const CANYON_ORIGIN = "https://www.canyon.com";

/** Demandware ajax grid for US sale (cgid + sale-day prefs from live site). */
export const CANYON_SALE_GRID_PATH =
  "/on/demandware.store/Sites-US-Site/en_US/Search-IncludeProductGrid";

export const CANYON_SALE_GRID_QUERY =
  "cgid=helper-sale-us&prefn1=pg_salespricedays&prefv1=US_190526%7Call_190526%7CUS_200526%7Call_200526%7CUS_210526%7Call_210526%7CUS_220526%7Call_220526&srule=bestsellers_sale_CUS&searchredirect=false&pn=1&format=ajax";

const PAGE_SIZE = 24;

export function parseUsdPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  const fromMatch = /from\s*\$?\s*([\d.]+)/i.exec(cleaned);
  if (fromMatch) {
    const n = parseFloat(fromMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m = /\$?\s*([\d.]+)/.exec(cleaned);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Master product id from Canyon PDP URL (`.../3175.html`). */
export function parseMasterProductIdFromUrl(productUrl: string): string | null {
  try {
    const path = new URL(productUrl).pathname;
    const m = /\/(\d+)\.html$/i.exec(path);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Color variation code from `dwvar_{id}_pv_rahmenfarbe=`. */
export function parseColorCodeFromProductUrl(productUrl: string): string | null {
  try {
    const url = new URL(productUrl);
    for (const [key, value] of url.searchParams) {
      if (/rahmenfarbe$/i.test(key) && value) return value;
    }
    return null;
  } catch {
    return null;
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Category path from GTM impression JSON on tile wrapper. */
export function parseGtmCategoryPath(gtmJson: string | undefined): string[] | null {
  if (!gtmJson) return null;
  try {
    const events = JSON.parse(gtmJson) as Array<{
      ecommerce?: {
        impressions?: Array<{ category?: string }>;
        currencyCode?: string;
      };
    }>;
    for (const ev of events) {
      const cat = ev.ecommerce?.impressions?.[0]?.category;
      if (cat && typeof cat === "string") {
        const parts = cat
          .split("/")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0) return parts;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function categoryPathFromProductUrl(productUrl: string): string[] | null {
  try {
    const segments = new URL(productUrl).pathname
      .split("/")
      .filter(Boolean);
    const enIdx = segments.indexOf("en-us");
    const after = enIdx >= 0 ? segments.slice(enIdx + 1) : segments;
    const withoutFile = after.filter((s) => !/\.html$/i.test(s));
    if (withoutFile.length < 2) return null;
    const crumbs = withoutFile.slice(0, -1).map(humanizeSlug);
    return crumbs.length > 0 ? crumbs : null;
  } catch {
    return null;
  }
}

export function buildCanyonSaleGridUrl(start: number, pageSize = PAGE_SIZE): string {
  return `${CANYON_ORIGIN}${CANYON_SALE_GRID_PATH}?${CANYON_SALE_GRID_QUERY}&start=${start}&sz=${pageSize}`;
}

export async function fetchCanyonProductGridHtml(
  start: number,
  pageSize = PAGE_SIZE,
): Promise<string> {
  const url = buildCanyonSaleGridUrl(start, pageSize);
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) {
    throw new Error(`Canyon sale grid ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

interface TileVariantLink {
  productUrl: string;
  colorLabel: string | null;
  colorCode: string | null;
}

function collectTileVariantLinks(
  $: CheerioAPI,
  tile: cheerio.Cheerio<any>,
): TileVariantLink[] {
  const links: TileVariantLink[] = [];
  const seen = new Set<string>();

  tile.find("button.js-tile-swatch[data-pdp-url]").each((_, el) => {
    const raw = $(el).attr("data-pdp-url");
    if (!raw) return;
    const productUrl = raw.startsWith("http")
      ? raw
      : `${CANYON_ORIGIN}${raw.startsWith("/") ? raw : `/${raw}`}`;
    if (seen.has(productUrl)) return;
    seen.add(productUrl);
    links.push({
      productUrl,
      colorLabel: $(el).attr("data-displayvalue")?.trim() || null,
      colorCode: $(el).attr("data-variation-value")?.trim() || null,
    });
  });

  if (links.length > 0) return links;

  const fallback =
    tile.find("a.productTileDefault__productName[href]").attr("href") ??
    tile.find('a[href*=".html"]').first().attr("href");
  if (!fallback) return [];

  const productUrl = fallback.startsWith("http")
    ? fallback
    : `${CANYON_ORIGIN}${fallback.startsWith("/") ? fallback : `/${fallback}`}`;

  return [
    {
      productUrl,
      colorLabel: null,
      colorCode: parseColorCodeFromProductUrl(productUrl),
    },
  ];
}

function parseTilePrices($: CheerioAPI, tile: cheerio.Cheerio<any>): {
  currentPrice: number | null;
  originalPrice: number | null;
} {
  const priceRoot = tile.find(".productTileDefault__price").first();
  const saleText = priceRoot.find(".productTile__priceSale").text();
  const originalText = priceRoot.find(".productTile__priceOriginal").text();
  const fullText = priceRoot.text();

  let currentPrice = parseUsdPrice(saleText);
  if (currentPrice === null) {
    currentPrice = parseUsdPrice(fullText);
  }
  const originalPrice = parseUsdPrice(originalText);

  return { currentPrice, originalPrice };
}

function parseTileImage($: CheerioAPI, tile: cheerio.Cheerio<any>): string | null {
  const img =
    tile.find(".productTileDefault__image").attr("src") ??
    tile.find(".productTileDefault__image").attr("data-src") ??
    tile.find("picture img").first().attr("src");
  if (!img) return null;
  if (img.startsWith("http")) return img;
  if (img.startsWith("//")) return `https:${img}`;
  return `${CANYON_ORIGIN}${img.startsWith("/") ? img : `/${img}`}`;
}

function buildStoreSku(masterId: string, colorCode: string | null): string {
  return colorCode ? `${masterId}-${colorCode}` : masterId;
}

/**
 * Parse Demandware `Search-IncludeProductGrid` HTML fragment into scrape rows.
 * Emits one row per color swatch when `data-pdp-url` is present on the tile.
 */
export function parseCanyonProductGridHtml(html: string): ScrapeResult[] {
  const $ = cheerio.load(html);
  const results: ScrapeResult[] = [];
  const seenSku = new Set<string>();

  $("[data-pid].js-productTileWrapper, [data-pid].productTileWrapper").each(
    (_, el) => {
      const tile = $(el);
      const productName =
        tile.find(".productTileDefault__productName").first().text().trim() ||
        tile.find("a.productTileDefault__productName").attr("title")?.trim() ||
        "";
      if (!productName) return;

      const { currentPrice, originalPrice } = parseTilePrices($, tile);
      if (currentPrice === null) return;

      const gtmCategory = parseGtmCategoryPath(
        tile.attr("data-gtm-impression") ?? tile.attr("data-gtm-click"),
      );
      const imageUrl = parseTileImage($, tile);
      const tileText = tile.text();
      const limitedStock = /only available in/i.test(tileText);

      for (const variant of collectTileVariantLinks($, tile)) {
        const masterId = parseMasterProductIdFromUrl(variant.productUrl);
        if (!masterId) continue;

        const colorCode =
          variant.colorCode ?? parseColorCodeFromProductUrl(variant.productUrl);
        const storeSku = buildStoreSku(masterId, colorCode);
        if (seenSku.has(storeSku)) continue;
        seenSku.add(storeSku);

        const category_path =
          gtmCategory ?? categoryPathFromProductUrl(variant.productUrl);

        const variant_options =
          variant.colorLabel || colorCode
            ? { Color: variant.colorLabel ?? colorCode! }
            : null;

        results.push({
          store_sku: storeSku,
          product_name: productName,
          current_price: currentPrice,
          original_price:
            originalPrice !== null && originalPrice > currentPrice
              ? originalPrice
              : null,
          product_url: variant.productUrl,
          image_url: imageUrl,
          brand: "Canyon",
          category_path,
          is_in_stock: !limitedStock,
          product_group_key: masterId,
          variant_options,
        });
      }
    },
  );

  return results;
}

/**
 * Scrape Canyon US sale PLP via Demandware ajax grid (fetch + Cheerio).
 */
export async function scrapeCanyonSalePl(_salePageUrl: string): Promise<ScrapeResult[]> {
  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();
  let start = 0;

  while (true) {
    const html = await fetchCanyonProductGridHtml(start);
    const pageResults = parseCanyonProductGridHtml(html);
    if (pageResults.length === 0) break;

    let added = 0;
    for (const row of pageResults) {
      if (seenSku.has(row.store_sku)) continue;
      seenSku.add(row.store_sku);
      all.push(row);
      added++;
      if (SCRAPER_MAX_PRODUCTS > 0 && all.length >= SCRAPER_MAX_PRODUCTS) {
        return all;
      }
    }

    if (added === 0) break;
    start += PAGE_SIZE;
  }

  return all;
}

/** Load bundled fixture (tests). */
export function loadCanyonGridFixture(name: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "__fixtures__", "canyon", name), "utf8");
}
