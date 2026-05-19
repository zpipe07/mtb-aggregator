import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { Browser, Page, Response } from "playwright";

import type { ScrapeResult } from "../types.js";
import {
  BROWSER_USER_AGENT,
  SCRAPE_DELAY_MS,
  SCRAPER_STORAGE_STATE,
  SCRAPER_WAF_WAIT_MS,
} from "../config.js";

const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

const MAX_PAGES = Number(process.env.SCRAPER_MAX_PAGES) || 5;

function isWafPage(title: string, hasGoku: boolean): boolean {
  return /human verification/i.test(title) || hasGoku;
}

/** Wait until AWS WAF clears and PLP content or product JSON is available. */
export async function waitForBackcountryFamilyPlReady(
  page: Page,
  brandLabel: string,
): Promise<{ ready: boolean; wafBlocked: boolean }> {
  const maxMs = SCRAPER_WAF_WAIT_MS;
  const pollMs = 2000;
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const title = document.title || "";
      const hasGoku = !!(window as unknown as { gokuProps?: unknown }).gokuProps;
      const stateKeys = [
        "__INITIAL_STATE__",
        "__PRELOADED_STATE__",
        "__STATE__",
        "__NEXT_DATA__",
        "__REDUX_STATE__",
      ] as const;
      const foundStateKey = stateKeys.find((k) => !!(window as unknown as Record<string, unknown>)[k]) ?? null;
      const pdpLinks = document.querySelectorAll('a[href*="/p/"]').length;
      return { title, hasGoku, foundStateKey, pdpLinks };
    });

    const waf = isWafPage(snap.title, snap.hasGoku);
    if (!waf && (snap.foundStateKey || snap.pdpLinks > 0)) {
      return { ready: true, wafBlocked: false };
    }

    await page.waitForTimeout(pollMs);
  }

  const finalSnap = await page.evaluate(() => ({
    title: document.title || "",
    hasGoku: !!(window as unknown as { gokuProps?: unknown }).gokuProps,
  }));
  const wafBlocked = isWafPage(finalSnap.title, finalSnap.hasGoku);
  if (wafBlocked) {
    console.error(
      `[scraper] ${brandLabel}: stuck on AWS WAF "Human Verification" after ${maxMs}ms.`,
    );
    console.error(
      `[scraper] ${brandLabel}: Pass WAF once in a real browser, then set SCRAPER_STORAGE_STATE to a Playwright storage JSON (see apps/scraper/README.md).`,
    );
    console.error(
      `[scraper] ${brandLabel}: Also try SCRAPER_HEADED=1 or BROWSER_WS_ENDPOINT with US residential egress.`,
    );
  }
  return { ready: false, wafBlocked };
}

/** Serialized for `page.evaluate` — resolves relative PDP URLs via `window.location.origin`. */
export const SALE_LISTING_EVAL_SOURCE = `
(function() {
  function parsePrice(val) {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    var cleaned = String(val).replace(/[^\\d.]/g, '');
    var n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function parsePriceFromText(text) {
    if (!text) return null;
    var m = String(text).match(/\\$\\s*([\\d,]+(?:\\.\\d{2})?)/);
    if (!m) return null;
    return parsePrice(m[1]);
  }

  var stateKeys = [
    '__INITIAL_STATE__', '__PRELOADED_STATE__', '__STATE__',
    '__NEXT_DATA__', '__REDUX_STATE__', '__APP_STATE__',
    '__SERVER_DATA__', 'initialState', '__data__'
  ];
  var state = null;
  for (var ki = 0; ki < stateKeys.length; ki++) {
    if (window[stateKeys[ki]]) { state = window[stateKeys[ki]]; break; }
  }

  if (!state) {
    var scripts = document.querySelectorAll('script:not([src])');
    for (var si = 0; si < scripts.length; si++) {
      var text = scripts[si].textContent || '';
      var match = text.match(/(?:window\\.\\w+\\s*=\\s*|=\\s*)(\\{[\\s\\S]{500,}\\})/);
      if (!match) match = text.match(/(\\{[\\s\\S]{500,}\\})/);
      if (match) {
        try {
          var parsed = JSON.parse(match[1]);
          var str = JSON.stringify(parsed);
          if (str.indexOf('"product') !== -1 || str.indexOf('"item') !== -1 || str.indexOf('"sku') !== -1) {
            state = parsed;
            break;
          }
        } catch(e) {}
      }
    }
  }

  function findProductArray(obj, depth) {
    if (depth > 8 || !obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        var first = obj[0];
        if (first && typeof first === 'object' && (
          first.sku || first.skuId || first.productId || first.itemId ||
          first.title || first.name || first.displayName
        )) {
          return obj;
        }
      }
      for (var i = 0; i < obj.length; i++) {
        var r = findProductArray(obj[i], depth + 1);
        if (r) return r;
      }
    } else {
      var productKeys = ['products', 'items', 'results', 'hits', 'skus', 'listings', 'productList', 'productResults'];
      for (var pk = 0; pk < productKeys.length; pk++) {
        if (Array.isArray(obj[productKeys[pk]]) && obj[productKeys[pk]].length > 0) {
          var candidate = findProductArray(obj[productKeys[pk]], depth + 1);
          if (candidate) return candidate;
        }
      }
      var keys = Object.keys(obj);
      for (var ki2 = 0; ki2 < keys.length; ki2++) {
        var child = obj[keys[ki2]];
        if (child && typeof child === 'object') {
          var r2 = findProductArray(child, depth + 1);
          if (r2) return r2;
        }
      }
    }
    return null;
  }

  function pushResult(results, row) {
    if (!row.name || !row.sku || !row.currentPrice || row.currentPrice <= 0 || !row.productUrl) return;
    results.push(row);
  }

  function normalizeProduct(p, origin) {
    var name = p.title || p.name || p.displayName || p.productName || '';
    var sku = p.sku || p.skuId || p.productId || p.itemId || p.id || '';
    var brand = p.brand || p.brandName || p.vendor || null;
    var currentPrice = parsePrice(
      (p.pricing && (p.pricing.sale || p.pricing.current || p.pricing.price)) ||
      p.salePrice || p.currentPrice || p.price || p.listPrice ||
      (p.prices && (p.prices.sale || p.prices.current))
    );
    var originalPrice = parsePrice(
      (p.pricing && (p.pricing.retail || p.pricing.original || p.pricing.compare || p.pricing.msrp)) ||
      p.retailPrice || p.originalPrice || p.compareAtPrice || p.msrp ||
      (p.prices && (p.prices.retail || p.prices.original))
    );
    var productUrl = p.url || p.productUrl || p.pdpUrl || p.href || '';
    if (productUrl && productUrl.indexOf('http') !== 0) {
      productUrl = origin + (productUrl.charAt(0) === '/' ? productUrl : '/' + productUrl);
    }
    var imageUrl = p.imageUrl || p.image || p.thumbnail ||
      (p.images && (p.images[0] && (p.images[0].url || p.images[0].src || p.images[0]))) ||
      null;
    var isInStock = p.inStock !== false && p.availability !== 'OUT_OF_STOCK' &&
      p.available !== false && p.status !== 'outofstock';
    return {
      sku: String(sku),
      name: String(name),
      currentPrice: currentPrice,
      originalPrice: (originalPrice && originalPrice > 0 && originalPrice > currentPrice) ? originalPrice : null,
      productUrl: productUrl,
      imageUrl: imageUrl ? String(imageUrl) : null,
      brand: (brand && String(brand).length < 80) ? String(brand) : null,
      isInStock: !!isInStock
    };
  }

  var products = state ? findProductArray(state, 0) : null;
  var results = [];
  var origin = window.location.origin || '';

  if (products) {
    for (var pi = 0; pi < products.length; pi++) {
      pushResult(results, normalizeProduct(products[pi], origin));
    }
  }

  // DOM fallback when embedded JSON uses unfamiliar keys but cards are rendered.
  if (results.length === 0) {
    var seen = {};
    var links = document.querySelectorAll('a[href*="/p/"]');
    for (var li = 0; li < links.length; li++) {
      var a = links[li];
      var href = a.href || a.getAttribute('href') || '';
      if (!href || seen[href]) continue;
      var card = a.closest('article, li, [data-testid], [class*="product"], [class*="Product"]') || a.parentElement;
      var cardText = card ? (card.textContent || '') : (a.textContent || '');
      var name = (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!name || name.length < 3) continue;
      var prices = cardText.match(/\\$\\s*[\\d,]+(?:\\.\\d{2})?/g) || [];
      var nums = [];
      for (var pri = 0; pri < prices.length; pri++) {
        var pv = parsePriceFromText(prices[pri]);
        if (pv) nums.push(pv);
      }
      if (nums.length === 0) continue;
      nums.sort(function(x, y) { return x - y; });
      var currentPrice = nums[0];
      var originalPrice = nums.length > 1 ? nums[nums.length - 1] : null;
      var sku = href.split('/').filter(Boolean).pop() || href;
      var img = card ? card.querySelector('img') : null;
      seen[href] = true;
      pushResult(results, {
        sku: sku,
        name: name.slice(0, 200),
        currentPrice: currentPrice,
        originalPrice: (originalPrice && originalPrice > currentPrice) ? originalPrice : null,
        productUrl: href.indexOf('http') === 0 ? href : origin + href,
        imageUrl: img && (img.src || img.getAttribute('src')) ? String(img.src || img.getAttribute('src')) : null,
        brand: null,
        isInStock: true
      });
    }
  }

  var foundStateKey = null;
  for (var dk = 0; dk < stateKeys.length; dk++) {
    if (window[stateKeys[dk]]) { foundStateKey = stateKeys[dk]; break; }
  }
  var scriptSample = null;
  if (!state) {
    var allScripts = document.querySelectorAll('script:not([src])');
    for (var ds = 0; ds < allScripts.length; ds++) {
      var t = allScripts[ds].textContent || '';
      if (t.length > 200) { scriptSample = t.slice(0, 500); break; }
    }
  }

  return {
    results: results,
    foundStateKey: foundStateKey,
    hasState: !!state,
    hasProducts: !!products,
    productCount: products ? products.length : 0,
    scriptSample: scriptSample,
    pageTitle: document.title || ''
  };
})()
`;

/** Build next page URL by incrementing the `page` query param (1-indexed). */
export function salePlIncrementPage(currentUrl: string, pageNum: number): string {
  const u = new URL(currentUrl);
  u.searchParams.set("page", String(pageNum));
  return u.toString();
}

export type SalePlExtractedProduct = {
  sku: string;
  name: string;
  currentPrice: number;
  originalPrice: number | null;
  productUrl: string;
  imageUrl: string | null;
  brand: string | null;
  isInStock: boolean;
};

export type SalePlExtractionDiag = {
  results: SalePlExtractedProduct[];
  foundStateKey: string | null;
  hasState: boolean;
  hasProducts: boolean;
  productCount: number;
  scriptSample: string | null;
  pageTitle?: string;
};

export function mapSalePlExtractedToScrapeResult(r: SalePlExtractedProduct): ScrapeResult {
  return {
    store_sku: r.sku,
    product_name: r.name,
    current_price: r.currentPrice,
    original_price: r.originalPrice,
    product_url: r.productUrl,
    image_url: r.imageUrl,
    brand: r.brand,
    category_path: null,
    is_in_stock: r.isInStock,
  };
}

export function deduplicateSalePlBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((row) => {
    if (seen.has(row.store_sku)) return false;
    seen.add(row.store_sku);
    return true;
  });
}

function findProductArrayInJson(obj: unknown, depth = 0): unknown[] | null {
  if (depth > 8 || obj == null || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      const first = obj[0];
      if (
        first &&
        typeof first === "object" &&
        ("sku" in first ||
          "skuId" in first ||
          "productId" in first ||
          "title" in first ||
          "name" in first ||
          "displayName" in first)
      ) {
        return obj;
      }
    }
    for (const item of obj) {
      const found = findProductArrayInJson(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = obj as Record<string, unknown>;
  for (const key of ["products", "items", "results", "hits", "skus", "listings", "productList", "productResults"]) {
    const val = record[key];
    if (Array.isArray(val) && val.length > 0) {
      const found = findProductArrayInJson(val, depth + 1);
      if (found) return found;
    }
  }
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const found = findProductArrayInJson(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function mapJsonProduct(p: Record<string, unknown>, origin: string): SalePlExtractedProduct | null {
  const parsePrice = (val: unknown): number | null => {
    if (val == null) return null;
    if (typeof val === "number") return val > 0 ? val : null;
    const n = parseFloat(String(val).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const name = String(p.title ?? p.name ?? p.displayName ?? p.productName ?? "");
  const sku = String(p.sku ?? p.skuId ?? p.productId ?? p.itemId ?? p.id ?? "");
  let productUrl = String(p.url ?? p.productUrl ?? p.pdpUrl ?? p.href ?? "");
  if (productUrl && !productUrl.startsWith("http")) {
    productUrl = origin + (productUrl.startsWith("/") ? productUrl : `/${productUrl}`);
  }
  const pricing = p.pricing as Record<string, unknown> | undefined;
  const prices = p.prices as Record<string, unknown> | undefined;
  const currentPrice =
    parsePrice(pricing?.sale ?? pricing?.current ?? pricing?.price) ??
    parsePrice(p.salePrice ?? p.currentPrice ?? p.price ?? p.listPrice) ??
    parsePrice(prices?.sale ?? prices?.current);
  if (!name || !sku || !currentPrice || !productUrl) return null;
  const originalPrice =
    parsePrice(pricing?.retail ?? pricing?.original ?? pricing?.compare ?? pricing?.msrp) ??
    parsePrice(p.retailPrice ?? p.originalPrice ?? p.compareAtPrice ?? p.msrp) ??
    parsePrice(prices?.retail ?? prices?.original);
  const brandRaw = p.brand ?? p.brandName ?? p.vendor;
  const images = p.images as unknown;
  let imageUrl: string | null = null;
  if (typeof p.imageUrl === "string") imageUrl = p.imageUrl;
  else if (typeof p.image === "string") imageUrl = p.image;
  else if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
    const img0 = images[0] as Record<string, unknown>;
    imageUrl = String(img0.url ?? img0.src ?? "");
  }
  return {
    sku,
    name,
    currentPrice,
    originalPrice:
      originalPrice && originalPrice > currentPrice ? originalPrice : null,
    productUrl,
    imageUrl,
    brand: brandRaw && String(brandRaw).length < 80 ? String(brandRaw) : null,
    isInStock:
      p.inStock !== false &&
      p.availability !== "OUT_OF_STOCK" &&
      p.available !== false &&
      p.status !== "outofstock",
  };
}

function extractFromCapturedJson(payloads: unknown[], origin: string): SalePlExtractedProduct[] {
  const out: SalePlExtractedProduct[] = [];
  for (const payload of payloads) {
    const arr = findProductArrayInJson(payload);
    if (!arr) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const mapped = mapJsonProduct(item as Record<string, unknown>, origin);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

function attachJsonResponseCapture(page: Page, payloads: unknown[]): void {
  page.on("response", (response: Response) => {
    void (async () => {
      try {
        if (!response.ok()) return;
        const ct = response.headers()["content-type"] ?? "";
        if (!ct.includes("json")) return;
        const url = response.url();
        if (!/search|catalog|product|graphql|api|rc/i.test(url)) return;
        const text = await response.text();
        if (text.length < 300 || !/(\"sku\"|\"product|\"items\")/i.test(text)) return;
        payloads.push(JSON.parse(text) as unknown);
      } catch {
        /* ignore parse errors */
      }
    })();
  });
}

/** Backcountry-family React PLPs (AWS WAF + embedded product JSON): Backcountry, Competitive Cyclist, etc. */
export async function scrapeBackcountryFamilySalePl(browser: Browser, opts: {
  startUrl: string;
  /** Log prefix, e.g. "Backcountry" or "Competitive Cyclist" */
  brandLabel: string;
  /** Filename prefix for HTML debug dumps */
  debugFilePrefix: string;
}): Promise<ScrapeResult[]> {
  const { startUrl, brandLabel, debugFilePrefix } = opts;
  const origin = new URL(startUrl).origin;
  const contextOptions: Parameters<Browser["newContext"]>[0] = {
    userAgent: BROWSER_USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "America/Denver",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  };
  if (SCRAPER_STORAGE_STATE) {
    console.log(`[scraper] ${brandLabel}: loading storage state from ${SCRAPER_STORAGE_STATE}`);
    contextOptions.storageState = SCRAPER_STORAGE_STATE;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const capturedJson: unknown[] = [];
  attachJsonResponseCapture(page, capturedJson);
  const allResults: ScrapeResult[] = [];

  try {
    let pageNum = 1;

    while (pageNum <= MAX_PAGES) {
      const pageUrl = pageNum === 1 ? startUrl : salePlIncrementPage(startUrl, pageNum);
      console.log(`[scraper] ${brandLabel} page ${pageNum}: fetching ${pageUrl}`);

      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      const { ready, wafBlocked } = await waitForBackcountryFamilyPlReady(page, brandLabel);
      if (!ready) {
        if (wafBlocked) break;
      }
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

      let extracted = (await page.evaluate(SALE_LISTING_EVAL_SOURCE)) as SalePlExtractionDiag;

      if (extracted.results.length === 0 && capturedJson.length > 0) {
        const fromNetwork = extractFromCapturedJson(capturedJson, origin);
        if (fromNetwork.length > 0) {
          console.log(
            `[scraper] ${brandLabel} page ${pageNum}: using ${fromNetwork.length} products from captured JSON responses`,
          );
          extracted = {
            ...extracted,
            results: fromNetwork,
            hasProducts: true,
            productCount: fromNetwork.length,
          };
        }
      }

      console.log(
        `[scraper] ${brandLabel} page ${pageNum}: title=${JSON.stringify(extracted.pageTitle ?? "")}, stateKey=${extracted.foundStateKey}, hasState=${extracted.hasState}, hasProducts=${extracted.hasProducts}, productCount=${extracted.productCount}, extracted=${extracted.results.length}`,
      );
      if (extracted.results.length === 0) {
        if (extracted.scriptSample) {
          console.log(`[scraper] ${brandLabel} script sample:`, extracted.scriptSample);
        }
        const html = await page.content();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        await mkdir(LOGS_DIR, { recursive: true });
        const htmlPath = join(LOGS_DIR, `${debugFilePrefix}-debug-${timestamp}.html`);
        await writeFile(htmlPath, html);
        console.log(`[scraper] ${brandLabel}: page HTML saved to ${htmlPath} (${html.length} bytes)`);
      }

      allResults.push(...extracted.results.map(mapSalePlExtractedToScrapeResult));

      if (extracted.results.length === 0) break;
      if (pageNum >= MAX_PAGES) break;

      pageNum++;
      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
    }
  } finally {
    await context.close();
  }

  const deduped = deduplicateSalePlBySku(allResults);
  console.log(`[scraper] ${brandLabel} done: ${deduped.length} listings after dedup`);
  return deduped;
}
