import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

const SPECIALIZED_ORIGIN = "https://www.specialized.com";

/** Persisted query hash for SEARCH_PRODUCT_DATA (sale PLP). */
export const SPECIALIZED_SEARCH_PRODUCT_DATA_HASH =
  "bf8ddeb358a5285109e572678e70c6a5194f6c03dafd3203bc644141736234ee";

const CATEGORY_LIST_NOISE = new Set([
  "suspension calculator",
  "turbo range calculator",
]);

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

export interface SearchProductResponseBody {
  data?: {
    searchProducts?: {
      results?: SearchProductResult[];
      pagination?: SearchProductPagination;
    };
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

export function buildSpecializedSaleSearchVariables(page: number): Record<string, unknown> {
  return {
    ajaxCatalog: "v3",
    baseSiteId: "SBCUnitedStates",
    categories: [],
    categoryCode: "sale",
    categoryFilter: "",
    currencyIso: "USD",
    filters: [],
    backgroundFilters: [{ key: "clearance_{country}", value: true }],
    getFromArchive: false,
    language: "en",
    page,
    path: "/us/en/shop/sale",
    q: "",
    region: "us",
    resultsFormat: "native",
    resultsPerPage: 96,
    routeTag: "",
    shouldShowColor: { property: "alt_clearance_{country}", acceptedValue: "1" },
    sort: null,
    temporaryAddlQueryString: `&bgfilter.clearance=true&&&excludedFacets=ss_price_employee&excludedFacets=ss_price_prodeal&resultsPerPage=96&page=${page}`,
    user_id: "",
    validSolrCampaign: true,
  };
}

export function buildSpecializedSaleSearchUrl(page: number): string {
  const variables = buildSpecializedSaleSearchVariables(page);
  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: SPECIALIZED_SEARCH_PRODUCT_DATA_HASH,
    },
  };
  const params = new URLSearchParams({
    operationName: "SEARCH_PRODUCT_DATA",
    variables: JSON.stringify(variables),
    extensions: JSON.stringify(extensions),
    localeCacheKey: "US:en",
  });
  return `${SPECIALIZED_ORIGIN}/api/graphql/SEARCH_PRODUCT_DATA?${params.toString()}`;
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

/**
 * Parse SEARCH_PRODUCT_DATA GraphQL JSON into scrape rows (one per swatch).
 */
export function parseSpecializedSearchProductResponse(
  body: SearchProductResponseBody,
): { rows: ScrapeResult[]; pagination: SearchProductPagination } {
  const search = body.data?.searchProducts;
  const pagination = search?.pagination ?? {};
  const results = search?.results ?? [];
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

export async function fetchSpecializedSaleSearchPage(
  page: number,
): Promise<SearchProductResponseBody> {
  const url = buildSpecializedSaleSearchUrl(page);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
      /** Apollo CSRF preflight — required for GET persisted queries. */
      "x-apollo-operation-name": "SEARCH_PRODUCT_DATA",
      "apollo-require-preflight": "true",
    },
  });
  if (!res.ok) {
    throw new Error(`Specialized sale search page ${page}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SearchProductResponseBody;
}

/**
 * Scrape Specialized US sale via persisted GraphQL SEARCH_PRODUCT_DATA (fetch only).
 */
export async function scrapeSpecializedSalePl(_salePageUrl: string): Promise<ScrapeResult[]> {
  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const body = await fetchSpecializedSaleSearchPage(page);
    const { rows, pagination } = parseSpecializedSearchProductResponse(body);
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

export function loadSpecializedGraphqlFixture(name: string): SearchProductResponseBody {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(
    join(dir, "__fixtures__", "specialized", name),
    "utf8",
  );
  return JSON.parse(raw) as SearchProductResponseBody;
}
