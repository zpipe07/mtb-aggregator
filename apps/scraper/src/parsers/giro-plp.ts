import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

const GIRO_ORIGIN = "https://www.giro.com";

/** Demandware ajax grid for US cycling archives sale. */
export const GIRO_SALE_GRID_PATH =
  "/on/demandware.store/Sites-GiroUS-Site/en_US/Search-UpdateGrid";

export const GIRO_SALE_GRID_QUERY = "cgid=archive-cycling";

const PAGE_SIZE = 60;

export function parseUsdPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  const m = /\$?\s*([\d.]+)/.exec(cleaned);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Color code from `dwvar_{masterId}_color=`. */
export function parseColorCodeFromProductUrl(productUrl: string): string | null {
  try {
    const url = new URL(productUrl);
    for (const [key, value] of url.searchParams) {
      if (/^dwvar_.*_color$/i.test(key) && value) return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** Master product id from `/product/{slug}/{masterId}.html`. */
export function parseMasterIdFromProductUrl(productUrl: string): string | null {
  try {
    const url = new URL(productUrl);
    const m = /\/(\d{10,}[A-Z]?)\.html$/i.exec(url.pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface GiroGtmData {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  price?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_category4?: string;
  item_category5?: string;
}

export function parseGtmData(raw: string | undefined): GiroGtmData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GiroGtmData;
  } catch {
    return null;
  }
}

/** Category crumbs from GTM item_category* fields (archives crumbs removed). */
export function categoryPathFromGtm(gtm: GiroGtmData | null): string[] | null {
  if (!gtm) return null;
  const parts = [
    gtm.item_category,
    gtm.item_category2,
    gtm.item_category3,
    gtm.item_category4,
    gtm.item_category5,
  ]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .filter((p) => !/^archives$/i.test(p));
  return parts.length > 0 ? parts : null;
}

export function buildGiroSaleGridUrl(start: number, pageSize = PAGE_SIZE): string {
  return `${GIRO_ORIGIN}${GIRO_SALE_GRID_PATH}?${GIRO_SALE_GRID_QUERY}&start=${start}&sz=${pageSize}`;
}

export async function fetchGiroProductGridHtml(
  start: number,
  pageSize = PAGE_SIZE,
): Promise<string> {
  const url = buildGiroSaleGridUrl(start, pageSize);
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) {
    throw new Error(`Giro sale grid ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

function absoluteGiroUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `${GIRO_ORIGIN}${href.startsWith("/") ? href : `/${href}`}`;
}

function parseTilePrices($: CheerioAPI, tile: cheerio.Cheerio<any>): {
  currentPrice: number | null;
  originalPrice: number | null;
} {
  const priceRoot = tile.find(".price").first();
  const saleText = priceRoot.find(".sales").text();
  const originalText = priceRoot.find(".strike-through.list").text();
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
    tile.find("img.product-tile-image").attr("data-src") ??
    tile.find("img.product-tile-image").attr("src");
  if (!img || img.startsWith("data:")) return null;
  if (img.startsWith("http")) return img;
  if (img.startsWith("//")) return `https:${img}`;
  return absoluteGiroUrl(img);
}

/**
 * Parse Demandware `Search-UpdateGrid` HTML fragment into scrape rows.
 * One row per color variant tile (`data-pid` on outer `.product` wrapper).
 */
export function parseGiroProductGridHtml(html: string): ScrapeResult[] {
  const $ = cheerio.load(html);
  const results: ScrapeResult[] = [];
  const seenSku = new Set<string>();

  $("div.product[data-pid]").each((_, el) => {
    const tile = $(el);
    const storeSku = tile.attr("data-pid")?.trim();
    if (!storeSku) return;

    const gtm = parseGtmData(tile.attr("data-gtmdata"));
    const productName =
      tile.find(".tile-body .pdp-link a.link").first().text().trim() ||
      gtm?.item_name?.trim() ||
      "";
    if (!productName) return;

    const href =
      tile.find(".tile-body .pdp-link a.link").attr("href") ??
      tile.find("a.product-tile-image-link").attr("href");
    if (!href) return;

    const productUrl = absoluteGiroUrl(href);
    const { currentPrice, originalPrice } = parseTilePrices($, tile);
    if (currentPrice === null) return;

    if (seenSku.has(storeSku)) return;
    seenSku.add(storeSku);

    const colorCode = parseColorCodeFromProductUrl(productUrl);
    const category_path = categoryPathFromGtm(gtm);
    const imageUrl = parseTileImage($, tile);
    const brand = gtm?.item_brand?.trim() || "Giro";
    const masterId = parseMasterIdFromProductUrl(productUrl);

    const variant_options = colorCode ? { Color: colorCode } : null;

    results.push({
      store_sku: storeSku,
      product_name: productName,
      current_price: currentPrice,
      original_price:
        originalPrice !== null && originalPrice > currentPrice
          ? originalPrice
          : null,
      product_url: productUrl,
      image_url: imageUrl,
      brand,
      category_path,
      is_in_stock: true,
      product_group_key: masterId,
      variant_options,
    });
  });

  return results;
}

/**
 * Scrape Giro cycling archives via Demandware ajax grid (fetch + Cheerio).
 */
export async function scrapeGiroSalePl(_salePageUrl: string): Promise<ScrapeResult[]> {
  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();
  let start = 0;

  while (true) {
    const html = await fetchGiroProductGridHtml(start);
    const pageResults = parseGiroProductGridHtml(html);
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
export function loadGiroGridFixture(name: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "__fixtures__", "giro", name), "utf8");
}
