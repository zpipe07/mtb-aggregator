import * as cheerio from "cheerio";
import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import { markScrapeTruncated } from "./jensonusa-pagination.js";

const ORIGIN = "https://www.ridebicycles.com";

/**
 * In-stock web groups on the SmartEtailing storefront. One scrape walks both
 * because `stores.scrape_url` is a single URL. `rb_onSale=1` is the Sale facet.
 */
export const RIDE_BICYCLES_SALE_LISTS = [
  "/product-list/in-stock-bikes-wg139/",
  "/product-list/in-stock-cycling-equipment-wg141/",
] as const;

/** Minimum discount vs compare-at (0.15 = 15% off). */
const MIN_DISCOUNT_FRACTION = 0.15;
/**
 * Maximum plausible discount. Bulk/case "was" prices and mismatched range
 * endpoints above this are data artifacts, not clearance.
 */
const MAX_DISCOUNT_FRACTION = 0.75;
/** How far a computed discount may drift from the card's "N% Off" badge. */
const STATED_DISCOUNT_TOLERANCE = 0.12;

const PAGE_DELAY_MS = Math.max(
  0,
  Number(process.env.RIDEBICYCLES_PAGE_DELAY_MS) || 500,
);
const MAX_PAGES = Math.max(
  1,
  Number(process.env.RIDEBICYCLES_MAX_PAGES) || 20,
);
const FETCH_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;
const RETRYABLE_HTTP_STATUS = new Set([403, 429, 503]);

const BREADCRUMB_SKIP = new Set(["home", "bicycling catalog"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RideBicyclesHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RideBicyclesHttpError";
    this.status = status;
  }
}

function clean(text: string | null | undefined): string {
  return (text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseUsdAmounts(text: string): number[] {
  const normalized = text.replace(/\u00a0/g, " ").replace(/,/g, "");
  const out: number[] = [];
  const re = /(\d+(?:\.\d{1,2})?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) out.push(value);
  }
  return out;
}

function parseSavingFraction(text: string): number | null {
  const match = clean(text).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  return pct / 100;
}

function discountFraction(current: number, original: number): number {
  return (original - current) / original;
}

function pairIsDeal(
  current: number,
  original: number,
  stated: number | null,
): boolean {
  if (!(original > current) || current <= 0) return false;
  const computed = discountFraction(current, original);
  if (computed < MIN_DISCOUNT_FRACTION || computed > MAX_DISCOUNT_FRACTION) {
    return false;
  }
  if (
    stated != null &&
    Math.abs(computed - stated) > STATED_DISCOUNT_TOLERANCE
  ) {
    return false;
  }
  return true;
}

/**
 * Pick a single current/original pair from a SmartEtailing price card.
 * Cards often show ranges ("$110.00 - $154.00" vs "$219.99", "Up to 50% Off").
 * Returns null when the card is not a representable 15–75% deal.
 */
export function resolveRideBicyclesDeal(input: {
  specialText: string;
  originalText: string;
  savingText: string;
}): { current: number; original: number } | null {
  const specials = parseUsdAmounts(input.specialText);
  const originals = parseUsdAmounts(input.originalText);
  if (specials.length === 0 || originals.length === 0) return null;

  const stated = parseSavingFraction(input.savingText);
  const specMin = Math.min(...specials);
  const specMax = Math.max(...specials);
  const origMin = Math.min(...originals);
  const origMax = Math.max(...originals);

  const candidates: Array<[number, number]> =
    originals.length === 1
      ? [[specMin, origMin]]
      : specials.length === 1
        ? [
            [specMin, origMin],
            [specMin, origMax],
          ]
        : [
            [specMin, origMin],
            [specMax, origMax],
          ];

  let best: { current: number; original: number; score: number } | null = null;
  for (const [current, original] of candidates) {
    if (!pairIsDeal(current, original, stated)) continue;
    const score =
      stated == null
        ? 0
        : Math.abs(discountFraction(current, original) - stated);
    if (!best || score < best.score) best = { current, original, score };
  }
  return best ? { current: best.current, original: best.original } : null;
}

function normalizeListPath(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path.endsWith("/") ? path : `${path}/`;
}

/** Sale-list URLs for a scrape. The legacy Shopify collection URL still maps here. */
export function rideBicyclesSaleListUrls(scrapeUrl: string): string[] {
  const paths = new Set<string>(RIDE_BICYCLES_SALE_LISTS);
  try {
    const requested = new URL(scrapeUrl);
    if (requested.pathname.includes("/product-list/")) {
      paths.add(normalizeListPath(requested.pathname));
    }
  } catch {
    // Use the default in-stock sale lists.
  }

  return [...paths].map((path) => {
    const list = new URL(path, ORIGIN);
    if (!list.searchParams.has("rb_onSale")) {
      list.searchParams.set("rb_onSale", "1");
    }
    if (!list.searchParams.has("maxItems")) {
      list.searchParams.set("maxItems", "60");
    }
    return list.toString();
  });
}

export function isRideBicyclesCatalogHtml(html: string): boolean {
  return (
    html.includes("seProductList") ||
    html.includes("seSearchProductsContainer") ||
    html.includes('id="SearchProducts"')
  );
}

function isBlockedListingHtml(html: string): boolean {
  const title = /<title>([^<]*)/i.exec(html)?.[1] ?? "";
  return /just a moment|403 forbidden|access denied|attention required/i.test(
    title,
  );
}

export function rideBicyclesNextPageUrl(
  html: string,
  pageUrl: string,
): string | null {
  const $ = cheerio.load(html);
  const href = $('a.sePaginationLink[title="Next page"]').attr("href");
  if (!href) return null;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

/**
 * SmartEtailing PDP paths are `/product/<slug>-<id>-1.htm` or `/product/<slug>-<id>.htm`.
 * The trailing `-1` is the default detail page, not the product id.
 */
function productIdFromPath(pathname: string): string | null {
  const withDefaultPage = /-(\d+)-1\.htm$/i.exec(pathname);
  if (withDefaultPage) return withDefaultPage[1];
  const bare = /-(\d+)\.htm$/i.exec(pathname);
  return bare?.[1] ?? null;
}

function canonicalProductUrl(href: string, pageUrl: string): string | null {
  try {
    const url = new URL(href, pageUrl);
    if (url.hostname === "ridebicycles.com") {
      url.hostname = "www.ridebicycles.com";
    }
    url.protocol = "https:";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isGiftCard(name: string): boolean {
  return /gift\s*card/i.test(name);
}

/** Parse one SmartEtailing product-list page into sale rows. */
export function parseRideBicyclesListingHtml(
  html: string,
  pageUrl: string,
): ScrapeResult[] {
  const $ = cheerio.load(html);
  const results: ScrapeResult[] = [];

  $("div.seProduct").each((_, el) => {
    const card = $(el);
    const href = card.find("a.seProductAnchor").attr("href") ?? "";
    const productUrl = canonicalProductUrl(href, pageUrl);
    if (!productUrl) return;
    let productId: string | null = null;
    try {
      productId = productIdFromPath(new URL(productUrl).pathname);
    } catch {
      return;
    }
    if (!productId) return;

    const brand = clean(card.find(".seBrandName").first().text()) || null;
    const itemName = clean(card.find(".seItemName").first().text());
    const title = clean(card.find("a.seProductAnchor").attr("title"));
    const productName = title || [brand, itemName].filter(Boolean).join(" ");
    if (!productName || isGiftCard(productName)) return;

    const deal = resolveRideBicyclesDeal({
      specialText: card.find(".seSpecialPrice").first().text(),
      originalText: card.find(".seOriginalPrice").first().text(),
      savingText: card.find(".seSavingPercent").first().text(),
    });
    if (!deal) return;

    const imageSrc = card.find("img").first().attr("src");
    let imageUrl: string | null = null;
    if (imageSrc && !/no-image-available/i.test(imageSrc)) {
      try {
        imageUrl = new URL(imageSrc, pageUrl).toString();
      } catch {
        imageUrl = null;
      }
    }

    results.push({
      store_sku: `se${productId}`,
      product_name: productName,
      current_price: deal.current,
      original_price: deal.original,
      product_url: productUrl,
      image_url: imageUrl,
      brand,
      category_path: null,
      is_in_stock: true,
      product_group_key: productId,
    });
  });

  return results;
}

async function fetchRideBicycles(url: string, label: string): Promise<string> {
  let lastStatus = 0;
  let lastStatusText = "";
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": BROWSER_USER_AGENT,
        Referer: `${ORIGIN}/`,
      },
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      if (isBlockedListingHtml(html)) {
        throw new Error(
          `${label} blocked (${res.status}): store did not return a catalog page`,
        );
      }
      return html;
    }
    lastStatus = res.status;
    lastStatusText = res.statusText;
    if (res.status === 404) {
      throw new RideBicyclesHttpError(
        `${label} 404: Not Found — Ride Bicycles catalog URL is missing (store platform may have changed)`,
        404,
      );
    }
    if (RETRYABLE_HTTP_STATUS.has(res.status) && attempt < FETCH_MAX_ATTEMPTS) {
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      continue;
    }
    throw new RideBicyclesHttpError(
      `${label} ${res.status}: ${res.statusText}`,
      res.status,
    );
  }
  throw new RideBicyclesHttpError(
    `${label} ${lastStatus}: ${lastStatusText}`,
    lastStatus,
  );
}

function dedupeBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((row) => {
    if (seen.has(row.store_sku)) return false;
    seen.add(row.store_sku);
    return true;
  });
}

/**
 * Scrape Ride Bicycles deals from SmartEtailing in-stock sale lists.
 * One row per product card (`se{productId}`). Shopify `products.json` is gone (ZAC-302).
 */
export async function scrapeRideBicycles(
  scrapeUrl: string,
): Promise<ScrapeResult[]> {
  const listUrls = rideBicyclesSaleListUrls(scrapeUrl);
  const results: ScrapeResult[] = [];
  let truncated = false;
  let requestCount = 0;

  for (const listUrl of listUrls) {
    let pageUrl: string | null = listUrl;
    let page = 1;
    while (pageUrl) {
      if (requestCount > 0 && PAGE_DELAY_MS > 0) await sleep(PAGE_DELAY_MS);
      requestCount++;
      const html = await fetchRideBicycles(
        pageUrl,
        `product-list page=${page}`,
      );
      if (!isRideBicyclesCatalogHtml(html)) {
        throw new Error(
          `product-list page=${page} did not contain a SmartEtailing catalog (store platform may have changed)`,
        );
      }

      const pageRows = parseRideBicyclesListingHtml(html, pageUrl);
      for (const row of pageRows) {
        results.push(row);
        if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS) {
          truncated = true;
          break;
        }
      }

      const nextUrl = rideBicyclesNextPageUrl(html, pageUrl);
      if (truncated) break;
      if (!nextUrl || nextUrl === pageUrl) break;
      if (page >= MAX_PAGES) {
        truncated = true;
        break;
      }
      pageUrl = nextUrl;
      page++;
    }
    if (truncated) break;
  }

  const deduped = dedupeBySku(results);
  console.log(
    `[scraper] Ride Bicycles: ${deduped.length} listings (${listUrls.length} sale list(s))`,
  );
  if (truncated) markScrapeTruncated(deduped);
  return deduped;
}

function parseCategoryPath(html: string): string[] | null {
  const $ = cheerio.load(html);
  const labels: string[] = [];
  $("ol.seProductBreadcrumb li").each((_, el) => {
    const li = $(el);
    if (li.hasClass("active")) return;
    const link = li.find("a").first();
    const href = link.attr("href") ?? "";
    if (href.includes("rb_br=")) return;
    const label = clean(link.attr("data-value") || link.text() || li.text());
    if (!label || BREADCRUMB_SKIP.has(label.toLowerCase())) return;
    labels.push(label);
  });
  return labels.length > 0 ? labels : null;
}

function parseSpecs(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};
  $("table.seProductSpecTable tr").each((_, row) => {
    const tr = $(row);
    const key = clean(tr.find("th").first().text());
    const valueCell = tr.find("td").first().clone();
    valueCell.find("br").replaceWith(" ");
    const value = clean(valueCell.text());
    if (!key || !value || key.length > 80 || value.length > 500) return;
    specs[key] = value;
  });
  return Object.keys(specs).length > 0 ? specs : null;
}

function parseDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const block = $("p.seProductPrimaryDescription").first().clone();
  block.find("br").replaceWith("\n");
  let text = block.text().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 50) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (text.length >= 50) return;
      try {
        const data = JSON.parse($(el).text()) as { ["@type"]?: string; description?: string };
        if (data["@type"] === "Product" && data.description) {
          text = clean(data.description);
        }
      } catch {
        // Ignore non-JSON script bodies.
      }
    });
  }
  if (!text || text.length < 50) return null;
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

export function parseRideBicyclesPdp(html: string): EnrichResult {
  return {
    category_path: parseCategoryPath(html),
    raw_specs: parseSpecs(html),
    description: parseDescription(html) ?? undefined,
  };
}

function pdpHasProductMarkup(html: string): boolean {
  return (
    html.includes("seProductBreadcrumb") ||
    html.includes("seProductSpecTable") ||
    html.includes("seProductPrimaryDescription")
  );
}

/**
 * Enrich a Ride Bicycles PDP (`/product/<slug>-<id>-1.htm`).
 * Shopify `/products/<handle>.json` is gone (ZAC-302).
 */
export async function enrichRideBicycles(
  productUrl: string,
): Promise<EnrichResult> {
  const url = new URL(productUrl);
  if (url.hostname === "ridebicycles.com") {
    url.hostname = "www.ridebicycles.com";
    url.protocol = "https:";
  }
  try {
    const html = await fetchRideBicycles(url.toString(), "product.html");
    if (!pdpHasProductMarkup(html)) {
      throw new Error(
        "Ride Bicycles PDP did not contain SmartEtailing product markup (store platform may have changed)",
      );
    }
    return parseRideBicyclesPdp(html);
  } catch (err) {
    if (err instanceof RideBicyclesHttpError && err.status === 404) {
      return { category_path: null, raw_specs: null, unavailable: true };
    }
    throw err;
  }
}
