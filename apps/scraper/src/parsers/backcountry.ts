import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import { runWithBrowser } from "../browser.js";
import { USER_AGENT, SCRAPE_DELAY_MS, ENRICH_DELAY_MS } from "../config.js";
import * as cheerio from "cheerio";

const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

const BASE_URL = "https://www.backcountry.com";

/** Build next page URL by incrementing the `page` query param (1-indexed). */
function buildNextPageUrl(currentUrl: string, pageNum: number): string {
  const u = new URL(currentUrl);
  u.searchParams.set("page", String(pageNum));
  return u.toString();
}

/** Derive a stable SKU from the product URL slug (last path segment before query). */
function skuFromUrl(productUrl: string): string {
  try {
    const pathname = new URL(productUrl).pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? productUrl;
  } catch {
    return productUrl;
  }
}

const MAX_PAGES = Number(process.env.SCRAPER_MAX_PAGES) || 5;

/**
 * Scrape Backcountry sale/closeout pages using Playwright.
 * Backcountry uses a React frontend; products are rendered in DOM cards.
 */
export async function scrapeBackcountry(url: string): Promise<ScrapeResult[]> {
  return runWithBrowser(async (browser) => {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    const allResults: ScrapeResult[] = [];

    try {
      let pageNum = 1;

      while (pageNum <= MAX_PAGES) {
        const pageUrl = pageNum === 1 ? url : buildNextPageUrl(url, pageNum);
        console.log(`[scraper] Backcountry page ${pageNum}: fetching ${pageUrl}`);

        // Use networkidle so we wait through the AWS WAF challenge reload
        await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 90000 });
        await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

        // Backcountry embeds product data as JSON in a <script> tag (SSR/React).
        // We try to read from common window state keys, then fall back to scanning
        // script tag contents for a JSON blob containing a products/items array.
        const extractScript = `
          (function() {
            function parsePrice(val) {
              if (val == null) return null;
              if (typeof val === 'number') return val;
              var cleaned = String(val).replace(/[^\\d.]/g, '');
              var n = parseFloat(cleaned);
              return isFinite(n) && n > 0 ? n : null;
            }

            // --- 1. Try known window state keys ---
            var stateKeys = [
              '__INITIAL_STATE__', '__PRELOADED_STATE__', '__STATE__',
              '__NEXT_DATA__', '__REDUX_STATE__', '__APP_STATE__',
              '__SERVER_DATA__', 'initialState', '__data__'
            ];
            var state = null;
            for (var ki = 0; ki < stateKeys.length; ki++) {
              if (window[stateKeys[ki]]) { state = window[stateKeys[ki]]; break; }
            }

            // --- 2. If no window key found, scan <script> tags for product arrays ---
            if (!state) {
              var scripts = document.querySelectorAll('script:not([src])');
              for (var si = 0; si < scripts.length; si++) {
                var text = scripts[si].textContent || '';
                // Look for large JSON blobs that contain product-like data
                var match = text.match(/(?:window\\.\\w+\\s*=\\s*|=\\s*)(\\{[\\s\\S]{500,}\\})/);
                if (!match) match = text.match(/(\\{[\\s\\S]{500,}\\})/);
                if (match) {
                  try {
                    var parsed = JSON.parse(match[1]);
                    // Check if this looks like it contains product data
                    var str = JSON.stringify(parsed);
                    if (str.indexOf('"product') !== -1 || str.indexOf('"item') !== -1 || str.indexOf('"sku') !== -1) {
                      state = parsed;
                      break;
                    }
                  } catch(e) {}
                }
              }
            }

            // --- 3. Walk the state to find a product array ---
            function findProductArray(obj, depth) {
              if (depth > 8 || !obj || typeof obj !== 'object') return null;
              if (Array.isArray(obj)) {
                // Check if this looks like a product list
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

            var products = state ? findProductArray(state, 0) : null;

            // --- 4. Build results from product array ---
            var results = [];
            if (products) {
              for (var pi = 0; pi < products.length; pi++) {
                var p = products[pi];
                // Try many possible field names
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
                  productUrl = 'https://www.backcountry.com' + productUrl;
                }
                var imageUrl = p.imageUrl || p.image || p.thumbnail ||
                  (p.images && (p.images[0] && (p.images[0].url || p.images[0].src || p.images[0]))) ||
                  null;
                var isInStock = p.inStock !== false && p.availability !== 'OUT_OF_STOCK' &&
                  p.available !== false && p.status !== 'outofstock';

                if (!name || !sku || !currentPrice || currentPrice <= 0) continue;
                if (!productUrl) continue;

                results.push({
                  sku: String(sku),
                  name: String(name),
                  currentPrice: currentPrice,
                  originalPrice: (originalPrice && originalPrice > 0 && originalPrice > currentPrice) ? originalPrice : null,
                  productUrl: productUrl,
                  imageUrl: imageUrl ? String(imageUrl) : null,
                  brand: (brand && String(brand).length < 80) ? String(brand) : null,
                  isInStock: !!isInStock
                });
              }
            }

            // --- Diagnostics for debugging ---
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
              scriptSample: scriptSample
            };
          })()
        `;

        const extracted = (await page.evaluate(extractScript)) as {
          results: Array<{
            sku: string;
            name: string;
            currentPrice: number;
            originalPrice: number | null;
            productUrl: string;
            imageUrl: string | null;
            brand: string | null;
            isInStock: boolean;
          }>;
          foundStateKey: string | null;
          hasState: boolean;
          hasProducts: boolean;
          productCount: number;
          scriptSample: string | null;
        };

        console.log(
          `[scraper] Backcountry page ${pageNum}: stateKey=${extracted.foundStateKey}, hasState=${extracted.hasState}, hasProducts=${extracted.hasProducts}, productCount=${extracted.productCount}, extracted=${extracted.results.length}`
        );
        if (!extracted.hasProducts) {
          if (extracted.scriptSample) {
            console.log('[scraper] Backcountry script sample:', extracted.scriptSample);
          }
          // Dump full page HTML to disk so we can inspect what Playwright actually loaded
          const html = await page.content();
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          await mkdir(LOGS_DIR, { recursive: true });
          const htmlPath = join(LOGS_DIR, `backcountry-debug-${timestamp}.html`);
          await writeFile(htmlPath, html);
          console.log(`[scraper] Backcountry: page HTML saved to ${htmlPath} (${html.length} bytes)`);
        }

        const pageResults: ScrapeResult[] = extracted.results.map((r) => ({
          store_sku: r.sku,
          product_name: r.name,
          current_price: r.currentPrice,
          original_price: r.originalPrice,
          product_url: r.productUrl,
          image_url: r.imageUrl,
          brand: r.brand,
          category_path: null,
          is_in_stock: r.isInStock,
        }));

        allResults.push(...pageResults);

        // Stop if no results found
        if (extracted.results.length === 0 || !extracted.hasProducts) break;
        if (pageNum >= MAX_PAGES) break;

        pageNum++;
        await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
      }
    } finally {
      await context.close();
    }

    const deduped = deduplicateBySku(allResults);
    console.log(`[scraper] Backcountry done: ${deduped.length} listings after dedup`);
    return deduped;
  });
}

function deduplicateBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.store_sku)) return false;
    seen.add(r.store_sku);
    return true;
  });
}

/**
 * Enrich a Backcountry PDP by fetching its HTML and extracting breadcrumbs + specs.
 * Uses cheerio to parse JSON-LD, breadcrumb links, and spec tables.
 */
export async function enrichBackcountry(productUrl: string): Promise<EnrichResult> {
  try {
    const res = await fetch(productUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`fetch ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    const categoryPath = extractBreadcrumbs(html);
    const rawSpecs = extractSpecs(html);
    const description = extractDescription(html);

    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));

    return {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description: description ?? undefined,
    };
  } catch (err) {
    console.error("[scraper] Backcountry enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}

/**
 * Extract description text from PDP HTML. Tries description-specific sections first,
 * then falls back to stripping spec tables/dl from main content.
 */
function extractDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  const descSelectors = [
    '[data-testid="product-description"]',
    ".product-description",
    "#product-description",
    '[id*="description"]',
    ".product-details",
    ".product-overview",
    "main [class*='description']",
  ];
  for (const sel of descSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const clone = el.clone();
      clone.find("table, dl").remove();
      const text = clean(clone.text());
      if (text && text.length >= 50 && text.length < 12000) return text;
    }
  }

  // Fallback: strip tables/dl from main or body, use remaining text
  const container = $("main").length ? $("main").first() : $("body").first();
  if (container.length) {
    const clone = container.clone();
    clone.find("table, dl").remove();
    const text = clean(clone.text());
    if (text && text.length >= 50) return text.length > 8000 ? text.slice(0, 8000) : text;
  }
  return null;
}

function extractBreadcrumbs(html: string): string[] | null {
  const $ = cheerio.load(html);
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  // 1. JSON-LD BreadcrumbList
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
        if (json?.["@type"] === "BreadcrumbList" && Array.isArray(json.itemListElement)) {
          const items: string[] = [];
          for (const item of json.itemListElement) {
            const name = item.name ?? item.item?.name;
            if (name) items.push(clean(String(name)));
          }
          if (items.length >= 2) {
            let trimmed = items.slice(0, -1);
            if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
            if (trimmed.length > 0) {
              result = trimmed;
              return;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  });
  if (result) return result;

  // 2. DOM breadcrumb links
  const selectors = [
    'nav[aria-label="Breadcrumb"] a',
    'nav[aria-label="breadcrumb"] a',
    ".breadcrumb a",
    ".breadcrumbs a",
    "[class*='breadcrumb'] a",
    "ol[class*='breadcrumb'] li a",
  ];
  for (const sel of selectors) {
    const items: string[] = [];
    $(sel).each((_, el) => {
      const t = clean($(el).text());
      if (t) items.push(t);
    });
    if (items.length >= 2) {
      let trimmed = items.slice(0, -1);
      if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
      if (trimmed.length > 0) return trimmed;
    }
  }

  return null;
}

function extractSpecs(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

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
      const key = clean($(el).text());
      const value = clean($(el).next("dd").text());
      if (!key || !value || key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  // Spec tables near a "Specs" heading
  $("table").each((_, el) => {
    const table = $(el);
    const heading = clean(table.prevAll("h1,h2,h3,h4,strong").first().text()).toLowerCase();
    if (heading.includes("spec") || heading.includes("details")) {
      collectFromTable(table);
    }
  });

  if (Object.keys(specs).length === 0) {
    $("table").each((_, el) => collectFromTable($(el)));
  }

  if (Object.keys(specs).length === 0) {
    $("dl").each((_, el) => {
      const dl = $(el);
      const heading = clean(dl.prevAll("h1,h2,h3,h4,strong").first().text()).toLowerCase();
      if (heading.includes("spec")) collectFromDl(dl);
    });
  }

  return Object.keys(specs).length > 0 ? specs : null;
}
