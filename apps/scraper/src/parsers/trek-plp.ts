import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

export const TREK_ORIGIN = "https://www.trekbikes.com";
export const TREK_OCC_BASE = "https://api.trekbikes.com/occ/v2/us";
export const TREK_MTB_CATEGORY_CODE = "B300";
export const TREK_SALE_QUERY = ":relevance:saleFlag:true";
export const TREK_PAGE_SIZE = 24;

interface TrekPrice {
  currencyIso?: string;
  formattedValue?: string;
  priceType?: string;
  value?: number;
}

interface TrekProductImage {
  format?: string;
  imageType?: string;
  url?: string;
}

export interface TrekOccProduct {
  brandNameFull?: string;
  code?: string;
  defaultCategory?: string;
  name?: string;
  price?: TrekPrice;
  saleFlag?: boolean;
  url?: string;
  images?: TrekProductImage[];
  colorKeyValue?: Record<string, string>;
}

export interface TrekOccPagination {
  currentPage?: number;
  pageSize?: number;
  totalPages?: number;
  totalResults?: number;
}

export interface TrekOccCategoryProductsResponse {
  products?: TrekOccProduct[];
  pagination?: TrekOccPagination;
  errors?: Array<{ message?: string; type?: string }>;
}

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

export function buildTrekProductUrl(relativeUrl: string): string {
  const path = relativeUrl.startsWith("/") ? relativeUrl : `/${relativeUrl}`;
  if (path.startsWith("/us/en_US")) {
    return `${TREK_ORIGIN}${path}`;
  }
  return `${TREK_ORIGIN}/us/en_US${path}`;
}

export function resolveTrekImageUrl(imageUrl: string | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("//")) return `https:${imageUrl}`;
  return `${TREK_ORIGIN}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
}

export function buildCategoryPath(defaultCategory: string | undefined): string[] | null {
  const parts: string[] = ["Mountain bikes"];
  if (defaultCategory?.trim()) {
    parts.push(defaultCategory.trim());
  }
  return parts.length > 0 ? parts : null;
}

export function buildVariantOptions(
  colorKeyValue: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!colorKeyValue || Object.keys(colorKeyValue).length === 0) return null;
  const colors = [...new Set(Object.values(colorKeyValue).map((v) => v.trim()).filter(Boolean))];
  if (colors.length === 0) return null;
  return { Color: colors.join(" / ") };
}

/** Decode HTML entity quotes in Vue `:product` JSON blobs. */
export function decodeTrekVueProductJson(raw: string): string {
  return raw
    .replace(/&#034;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Parse wasPriceRange from PLP HTML `:product="{...}"` blocks keyed by product code. */
export function parseTrekWasPriceRangeByCode(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const blockRe = /:product="\{([\s\S]*?)\}"/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    try {
      const product = JSON.parse(decodeTrekVueProductJson(`{${match[1]}}`)) as {
        code?: string;
        wasPriceRange?: string;
      };
      if (product.code && product.wasPriceRange?.trim()) {
        map.set(String(product.code), product.wasPriceRange.trim());
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return map;
}

export function buildTrekCategoryProductsUrl(currentPage: number): string {
  const params = new URLSearchParams({
    query: TREK_SALE_QUERY,
    fields: "products(FULL),pagination(FULL)",
    pageSize: String(TREK_PAGE_SIZE),
    currentPage: String(currentPage),
    lang: "en_US",
    curr: "USD",
  });
  return `${TREK_OCC_BASE}/categories/${TREK_MTB_CATEGORY_CODE}/products?${params.toString()}`;
}

export async function fetchTrekCategoryProductsPage(
  currentPage: number,
): Promise<TrekOccCategoryProductsResponse> {
  const url = buildTrekCategoryProductsUrl(currentPage);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Trek OCC category products page ${currentPage}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TrekOccCategoryProductsResponse;
}

export async function fetchTrekPlpHtml(scrapeUrl: string): Promise<string> {
  const res = await fetch(scrapeUrl, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Trek PLP HTML ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

export function parseTrekOccProductsResponse(
  body: TrekOccCategoryProductsResponse,
  wasPriceByCode: Map<string, string> = new Map(),
): { rows: ScrapeResult[]; pagination: TrekOccPagination } {
  const pagination = body.pagination ?? {};
  const rows: ScrapeResult[] = [];

  for (const product of body.products ?? []) {
    if (!product.saleFlag) continue;
    const code = product.code?.trim();
    const name = product.name?.trim();
    const relativeUrl = product.url?.trim();
    const current_price = product.price?.value;
    if (!code || !name || !relativeUrl || typeof current_price !== "number" || current_price <= 0) {
      continue;
    }

    const wasPriceText = wasPriceByCode.get(code);
    const parsedWas = wasPriceText ? parseUsdPrice(wasPriceText) : null;
    const original_price =
      parsedWas !== null && parsedWas > current_price ? parsedWas : null;

    rows.push({
      store_sku: code,
      product_name: name,
      current_price,
      original_price,
      product_url: buildTrekProductUrl(relativeUrl),
      image_url: resolveTrekImageUrl(product.images?.[0]?.url),
      brand: product.brandNameFull?.trim() || "Trek",
      category_path: buildCategoryPath(product.defaultCategory),
      is_in_stock: true,
      product_group_key: code,
      variant_options: buildVariantOptions(product.colorKeyValue),
    });
  }

  return { rows, pagination };
}

/**
 * Scrape Trek US MTB sale via SAP Commerce OCC + PLP HTML wasPriceRange merge.
 */
export async function scrapeTrekSalePl(scrapeUrl: string): Promise<ScrapeResult[]> {
  const [wasPriceByCode] = await Promise.all([
    fetchTrekPlpHtml(scrapeUrl)
      .then(parseTrekWasPriceRangeByCode)
      .catch((err) => {
        console.warn("[scraper] Trek PLP wasPriceRange fetch failed:", err);
        return new Map<string, string>();
      }),
  ]);

  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();
  let currentPage = 0;
  let totalPages = 1;

  while (currentPage < totalPages) {
    const body = await fetchTrekCategoryProductsPage(currentPage);
    if (body.errors?.length) {
      throw new Error(
        `Trek OCC error: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }

    const { rows, pagination } = parseTrekOccProductsResponse(body, wasPriceByCode);
    totalPages = pagination.totalPages ?? totalPages;

    let added = 0;
    for (const row of rows) {
      if (seenSku.has(row.store_sku)) continue;
      seenSku.add(row.store_sku);
      all.push(row);
      added++;
      if (SCRAPER_MAX_PRODUCTS > 0 && all.length >= SCRAPER_MAX_PRODUCTS) {
        return all;
      }
    }

    if (added === 0 && currentPage > 0) break;
    currentPage++;
  }

  return all;
}

export function loadTrekFixture(name: string): TrekOccCategoryProductsResponse {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "__fixtures__", "trek", name), "utf8");
  return JSON.parse(raw) as TrekOccCategoryProductsResponse;
}
