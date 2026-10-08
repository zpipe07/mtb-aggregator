import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

const SPECIALIZED_ORIGIN = "https://www.specialized.com";
const SPECIALIZED_SALE_PAGE_URL = `${SPECIALIZED_ORIGIN}/us/en/shop/sale`;

const CATEGORY_LIST_NOISE = new Set([
  "suspension calculator",
  "turbo range calculator",
]);

/**
 * JWT-like site tokens embedded in sale PLP HTML for RPC coreParams.code.
 * The middle segment is one or more `_<letter><digits>` pieces, so both
 * `_v39_v39` and `_v39_v39_f4` match (ZAC-300).
 */
const SPECIALIZED_RPC_CODE_HEADER = "eyJhbGciOiJIUzI1NiJ9";
const SPECIALIZED_RPC_CODE_PATTERN = new RegExp(
  `${SPECIALIZED_RPC_CODE_HEADER}\\.(?:_[a-z]\\d+)+\\.[A-Za-z0-9_~-]+`,
);
const SPECIALIZED_RPC_CODE_MISS_SNIPPET_CHARS = 200;

interface ColorPrices {
  minPrice?: number | null;
  maxPrice?: number | null;
  minDiscountPrice?: number | null;
  maxDiscountPrice?: number | null;
}

interface SwatchJson {
  id?: string;
  color?: string | null;
  swatch?: string | null;
  plpImageId?: string | null;
  colorPrices?: ColorPrices | null;
}

interface SearchProductResult {
  uid?: string;
  name?: string;
  imageUrl?: string | null;
  url?: string;
  productData?: {
    id?: string;
    list?: string;
    name?: string;
  };
  swatchesJSON?: SwatchJson[] | null;
}

interface SearchProductPagination {
  totalResults?: number;
  currentPage?: number;
  totalPages?: number;
  perPage?: number;
}

export interface SpecializedRpcSearchProductResponseBody {
  success?: boolean;
  data?: {
    results?: SearchProductResult[];
    pagination?: SearchProductPagination;
  };
}

export function parseCategoryPathFromList(list: string | undefined): string[] | null {
  if (!list?.trim()) return null;
  const parts = list
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !CATEGORY_LIST_NOISE.has(p.toLowerCase()));
  return parts.length > 0 ? parts : null;
}

function specializedRpcCodeMissDetail(html: string): string {
  const idx = html.indexOf(SPECIALIZED_RPC_CODE_HEADER);
  if (idx < 0) {
    return `${SPECIALIZED_RPC_CODE_HEADER} not present in HTML`;
  }
  const snippet = html
    .slice(idx, idx + SPECIALIZED_RPC_CODE_MISS_SNIPPET_CHARS)
    .replace(/\s+/g, " ");
  return `near ${snippet}`;
}

export function extractSpecializedRpcCode(html: string): string {
  const match = SPECIALIZED_RPC_CODE_PATTERN.exec(html);
  if (!match?.[0]) {
    throw new Error(
      `Specialized sale page: RPC code token not found in HTML (${specializedRpcCodeMissDetail(html)})`,
    );
  }
  return match[0];
}

export function buildSpecializedSaleSearchRpcArgs(page: number): Record<string, unknown> {
  return {
    breadcrumbCategories: [],
    pageConfigCategoryCode: "sale",
    productQueryCategoryCode: "",
    currencyIso: "USD",
    filters: [],
    backgroundFilters: [{ key: "clearance_{country}", value: true }],
    getFromArchive: false,
    page,
    q: "",
    resultsPerPage: 96,
    routeTag: "",
    shouldShowColor: { property: "alt_clearance_{country}", acceptedValue: "1" },
    sort: null,
    temporaryAddlQueryString: `&bgfilter.clearance=true&&&excludedFacets=ss_price_employee&excludedFacets=ss_price_prodeal&resultsPerPage=96&page=${page}`,
    validSolrCampaign: true,
  };
}

export function buildSpecializedSaleSearchRpcCoreParams(code: string): Record<string, unknown> {
  return {
    baseSiteId: "SBCUnitedStates",
    code,
    locale: "en-US",
  };
}

export function buildSpecializedSaleSearchRpcUrl(page: number, code: string): string {
  const params = new URLSearchParams({
    coreParams: JSON.stringify(buildSpecializedSaleSearchRpcCoreParams(code)),
    args: JSON.stringify(buildSpecializedSaleSearchRpcArgs(page)),
  });
  return `${SPECIALIZED_ORIGIN}/api/rpc/search/searchProducts?${params.toString()}`;
}

function colorLabel(swatch: SwatchJson): string | null {
  if (swatch.color?.trim()) return swatch.color.trim();
  if (swatch.swatch?.trim()) return swatch.swatch.trim();
  return null;
}

function resolveCurrentPrice(prices: ColorPrices | null | undefined): number | null {
  if (!prices) return null;
  const discount = prices.minDiscountPrice;
  if (typeof discount === "number" && Number.isFinite(discount) && discount > 0) {
    return discount;
  }
  const min = prices.minPrice;
  if (typeof min === "number" && Number.isFinite(min) && min > 0) return min;
  return null;
}

function resolveOriginalPrice(
  prices: ColorPrices | null | undefined,
  current: number,
): number | null {
  if (!prices) return null;
  const msrp = prices.minPrice;
  if (typeof msrp === "number" && Number.isFinite(msrp) && msrp > current) {
    return msrp;
  }
  const max = prices.maxPrice;
  if (typeof max === "number" && Number.isFinite(max) && max > current) {
    return max;
  }
  return null;
}

function buildProductUrl(resultUrl: string, swatchId: string): string {
  const path = resultUrl.startsWith("http")
    ? new URL(resultUrl).pathname + new URL(resultUrl).search
    : resultUrl.startsWith("/")
      ? resultUrl
      : `/${resultUrl}`;
  const base = `${SPECIALIZED_ORIGIN}${path}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}color=${encodeURIComponent(swatchId)}`;
}

function parseSearchProductResults(
  results: SearchProductResult[],
  pagination: SearchProductPagination,
): { rows: ScrapeResult[]; pagination: SearchProductPagination } {
  const rows: ScrapeResult[] = [];
  const categoryFromList = new Map<string, string[] | null>();

  for (const result of results) {
    const productName = result.name?.trim() || result.productData?.name?.trim() || "";
    if (!productName || !result.url) continue;

    const groupKey = result.uid ?? result.productData?.id ?? null;
    let category_path = categoryFromList.get(result.url);
    if (category_path === undefined) {
      category_path = parseCategoryPathFromList(result.productData?.list);
      categoryFromList.set(result.url, category_path);
    }

    const swatches = result.swatchesJSON ?? [];
    if (swatches.length === 0) continue;

    for (const swatch of swatches) {
      const swatchId = swatch.id?.trim();
      if (!swatchId) continue;

      const current_price = resolveCurrentPrice(swatch.colorPrices);
      if (current_price === null) continue;

      const original_price = resolveOriginalPrice(swatch.colorPrices, current_price);
      const label = colorLabel(swatch);

      rows.push({
        store_sku: swatchId,
        product_name: productName,
        current_price,
        original_price,
        product_url: buildProductUrl(result.url, swatchId),
        image_url: swatch.plpImageId ?? result.imageUrl ?? null,
        brand: "Specialized",
        category_path,
        is_in_stock: true,
        product_group_key: groupKey,
        variant_options: label ? { Color: label } : null,
      });
    }
  }

  return { rows, pagination };
}

/**
 * Parse RPC searchProducts JSON into scrape rows (one per swatch).
 */
export function parseSpecializedRpcSearchProductResponse(
  body: SpecializedRpcSearchProductResponseBody,
): { rows: ScrapeResult[]; pagination: SearchProductPagination } {
  const data = body.data ?? {};
  return parseSearchProductResults(data.results ?? [], data.pagination ?? {});
}

function specializedRpcHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": BROWSER_USER_AGENT,
    Referer: SPECIALIZED_SALE_PAGE_URL,
    Origin: SPECIALIZED_ORIGIN,
  };
}

function formatFetchError(page: number, res: Response, bodyText: string): string {
  const contentType = res.headers.get("content-type") ?? "unknown";
  const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 160);
  return `Specialized sale search page ${page}: ${res.status} ${res.statusText} (${contentType}) ${snippet}`;
}

export async function fetchSpecializedSaleHtml(
  salePageUrl: string = SPECIALIZED_SALE_PAGE_URL,
): Promise<string> {
  const res = await fetch(salePageUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(formatFetchError(0, res, bodyText));
  }
  return bodyText;
}

export async function fetchSpecializedSaleSearchPage(
  page: number,
  code: string,
): Promise<SpecializedRpcSearchProductResponseBody> {
  const url = buildSpecializedSaleSearchRpcUrl(page, code);
  const res = await fetch(url, { headers: specializedRpcHeaders() });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(formatFetchError(page, res, bodyText));
  }

  let body: SpecializedRpcSearchProductResponseBody;
  try {
    body = JSON.parse(bodyText) as SpecializedRpcSearchProductResponseBody;
  } catch {
    throw new Error(formatFetchError(page, res, bodyText));
  }

  if (body.success !== true) {
    throw new Error(formatFetchError(page, res, bodyText));
  }

  return body;
}

/**
 * Scrape Specialized US sale via RPC searchProducts (fetch only).
 */
export async function scrapeSpecializedSalePl(salePageUrl: string): Promise<ScrapeResult[]> {
  const html = await fetchSpecializedSaleHtml(salePageUrl);
  const code = extractSpecializedRpcCode(html);

  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const body = await fetchSpecializedSaleSearchPage(page, code);
    const { rows, pagination } = parseSpecializedRpcSearchProductResponse(body);
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

    if (added === 0 && page > 1) break;
    page++;
  }

  return all;
}

export function loadSpecializedRpcFixture(
  name: string,
): SpecializedRpcSearchProductResponseBody {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "__fixtures__", "specialized", name), "utf8");
  return JSON.parse(raw) as SpecializedRpcSearchProductResponseBody;
}
