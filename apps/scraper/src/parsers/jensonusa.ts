import { mkdir } from "fs/promises";
import { join } from "path";
import { chromium } from "playwright";
import type { ScrapeResult } from "../types.js";
import { USER_AGENT, SCRAPE_DELAY_MS, ENRICH_DELAY_MS } from "../config.js";

export interface EnrichResult {
  category_path: string[] | null;
}

const BASE_URL = "https://www.jensonusa.com";
const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

const MAX_PAGES = 20; // Safety limit

/** Build next page URL by incrementing the pn (page number) param. JensonUSA uses pn, zero-indexed: pn=0 is page 1. */
function buildNextPageUrl(currentUrl: string): string | null {
  if (!currentUrl.includes("jensonusa.com/clearance")) return null;
  try {
    const u = new URL(currentUrl);
    const pn = parseInt(u.searchParams.get("pn") || "0", 10);
    u.searchParams.set("pn", String(pn + 1));
    return u.toString();
  } catch {
    return null;
  }
}

export async function scrapeJensonUSA(url: string): Promise<ScrapeResult[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    // Use ps=100 for clearance to get more items per page (fewer page requests)
    let currentUrl = url;
    if (url.includes("jensonusa.com/clearance") && !url.includes("ps=")) {
      currentUrl = url.includes("?") ? `${url}&ps=100` : `${url}?ps=100`;
    }

    const allResults: ScrapeResult[] = [];
    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
      pageNum++;
      console.log(`[scraper] JensonUSA page ${pageNum}: fetching ${currentUrl}`);
      await page.goto(currentUrl, { waitUntil: "load", timeout: 60000 });

      // Wait for dynamic content (products often load via JS after initial render)
      await new Promise((r) => setTimeout(r, 8000));

      // Polite delay before scraping
      await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

      // Use string to avoid tsx/transpiler adding __name or other helpers that break in browser context
      // JensonUSA uses data-product-result-dto with JSON: { name, url, code, brand, catalogNodeCodes, selectedVariant: { listPrice: { amount } } }
      const extractScript = `
      const parsePriceFromText = (text) => {
        const m = (text || '').replace(/,/g, '').match(/\\$?([\\d.]+)/);
        return m ? parseFloat(m[1]) : null;
      };
      const deriveCategory = (codes, brand) => {
        if (!codes || !Array.isArray(codes)) return null;
        const brandLower = (brand || '').toLowerCase();
        for (const c of codes) {
          if (!c || typeof c !== 'string') continue;
          if (c.toLowerCase() === brandLower) continue;
          if (c.toLowerCase().includes('sale')) continue;
          if (/^\\d{8,}$/.test(c) || /^C\\d{7}$/.test(c)) continue;
          var seg = c.split('-')[0];
          if (seg && seg.length > 2) return seg;
        }
        return null;
      };
      const results = [];
      const baseUrl = "https://www.jensonusa.com";
      const productCards = document.querySelectorAll("[data-product-result-dto]");
      for (const card of productCards) {
        const dtoStr = card.getAttribute("data-product-result-dto");
        if (!dtoStr) continue;
        try {
          const dto = JSON.parse(dtoStr.replace(/&quot;/g, '"'));
          const name = dto.name;
          const urlPath = (dto.url || "").replace(/^\\//, "");
          if (!name || !urlPath) continue;
          const url = urlPath.startsWith("http") ? urlPath : baseUrl + "/" + urlPath;
          const sku = dto.code || urlPath;
          let currentPrice = null;
          if (dto.selectedVariant && dto.selectedVariant.listPrice) {
            currentPrice = dto.selectedVariant.listPrice.amount;
          }
          if (!currentPrice && dto.listPrice) currentPrice = dto.listPrice.amount;
          if (!currentPrice) {
            const priceText = card.textContent || "";
            currentPrice = parsePriceFromText(priceText);
          }
          const container = card.closest(".list-item") || card;
          const img = container.querySelector("img");
          let imageUrl = (dto.selectedVariant && dto.selectedVariant.imageUrl) || dto.imageUrl || (img ? img.src : null);
          if (imageUrl && imageUrl.startsWith("data:")) imageUrl = null;
          let originalPrice = null;
          if (dto.selectedVariant && dto.selectedVariant.originalPrice) {
            originalPrice = dto.selectedVariant.originalPrice.amount;
          }
          if (!originalPrice && dto.originalPrice) originalPrice = dto.originalPrice.amount;
          const brand = dto.brand && typeof dto.brand === 'string' ? dto.brand.trim() : null;
          const cat = deriveCategory(dto.catalogNodeCodes, brand);
          const category_path = cat ? [cat] : null;
          if (currentPrice && currentPrice > 0 && currentPrice < 100000) {
            results.push({ sku, name, url, currentPrice, originalPrice, imageUrl, brand, category_path });
          }
        } catch (e) { continue; }
      }
      if (results.length === 0) {
        const links = document.querySelectorAll('a[href*="jensonusa.com"]');
        const seen = new Set();
        for (const link of links) {
          const href = link.href;
          let path;
          try { path = new URL(href).pathname; } catch (e) { continue; }
          if (path === "/" || path === "/clearance" || path.startsWith("/clearance") || path.startsWith("/sale")) continue;
          const pathParts = path.split("/").filter(Boolean);
          if (pathParts.length < 1) continue;
          const name = (link.textContent || '').trim();
          if (!name || name.length < 3 || name.length > 200) continue;
          const pathClean = path.replace(/^\\//, "").replace(/\\/$/, "").split("?")[0];
          if (seen.has(pathClean)) continue;
          seen.add(pathClean);
          const container = link.closest("div, li, article, section") || link.parentElement;
          const containerText = (container && container.textContent) || "";
          const priceMatch = containerText.match(/\\$[\\d,]+\\.?\\d*/);
          const currentPrice = priceMatch ? parsePriceFromText(priceMatch[0]) : null;
          const msrpMatch = containerText.match(/MSRP\\s*\\$[\\d,]+\\.?\\d*/);
          const originalPrice = msrpMatch ? parsePriceFromText(msrpMatch[0]) : null;
          const img = container ? container.querySelector("img") : null;
          let imageUrl = img ? img.src : null;
          if (imageUrl && imageUrl.startsWith("data:")) imageUrl = null;
          if (currentPrice && currentPrice > 0 && currentPrice < 100000) {
            results.push({ sku: pathClean, name, url: href, currentPrice, originalPrice, imageUrl, brand: null, category_path: null });
          }
        }
      }
      return { results: results };
    `;

    const extracted = (await page.evaluate(
      `(function() { ${extractScript} })()`
    )) as {
      results: Array<{
        sku: string;
        name: string;
        url: string;
        currentPrice: number | null;
        originalPrice: number | null;
        imageUrl: string | null;
        brand: string | null;
        category_path: string[] | null;
      }>;
    };

    const rawResults = extracted.results;
    const results: ScrapeResult[] = rawResults.map((r) => ({
      store_sku: r.sku,
      product_name: r.name,
      current_price: r.currentPrice!,
      original_price: r.originalPrice,
      product_url: r.url,
      image_url: r.imageUrl,
      brand: r.brand ?? null,
      category_path: r.category_path ?? null,
      is_in_stock: true,
    }));

      allResults.push(...results);
      const nextUrl = buildNextPageUrl(currentUrl);
      console.log(`[scraper] JensonUSA page ${pageNum}: got ${results.length} listings, nextPageUrl=${nextUrl ?? "none"}, total=${allResults.length}`);

      if (results.length >= 48 && nextUrl) {
        currentUrl = nextUrl;
        await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
      } else {
        break;
      }
    }

    const deduped = deduplicateBySku(allResults);
    console.log(`[scraper] JensonUSA done: ${deduped.length} listings after dedup`);
    return deduped;
  } catch (err) {
    try {
      const context = browser.contexts()[0];
      const page = context?.pages()[0];
      if (page) {
        await mkdir(LOGS_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const screenshotPath = join(LOGS_DIR, `jensonusa-error-${timestamp}.png`);
        await page.screenshot({ path: screenshotPath });
        console.error("Screenshot saved to", screenshotPath);
      }
    } catch (screenshotErr) {
      console.error("Failed to save screenshot:", screenshotErr);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

function deduplicateBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.store_sku)) return false;
    seen.add(r.store_sku);
    return true;
  });
}

/** Extract category from PDP breadcrumbs. JensonUSA uses breadcrumb links. */
export async function enrichJensonUSA(productUrl: string): Promise<EnrichResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();
    await page.goto(productUrl, { waitUntil: "load", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    const extractBreadcrumb = `
      (function() {
        var items = [];
        var sel = 'nav[aria-label="Breadcrumb"] a, nav[aria-label="breadcrumb"] a, .breadcrumb a, .breadcrumbs a, [class*="breadcrumb"] a, ol[class*="breadcrumb"] li a';
        var links = document.querySelectorAll(sel);
        if (links.length === 0) {
          var scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (var i = 0; i < scripts.length; i++) {
            try {
              var json = JSON.parse(scripts[i].textContent || '{}');
              if (json['@type'] === 'BreadcrumbList' && json.itemListElement) {
                for (var j = 0; j < json.itemListElement.length; j++) {
                  var el = json.itemListElement[j];
                  var name = el.name || (el.item && el.item.name);
                  if (name) items.push(name);
                }
                break;
              }
            } catch (e) {}
          }
        } else {
          for (var k = 0; k < links.length; k++) {
            var t = (links[k].textContent || '').trim();
            if (t) items.push(t);
          }
        }
        if (items.length < 2) return null;
        items = items.slice(0, -1);
        if (items[0] && /^home$/i.test(items[0])) items = items.slice(1);
        return items.length > 0 ? items : null;
      })()
    `;

    const category_path = (await page.evaluate(extractBreadcrumb)) as string[] | null;

    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));

    return { category_path };
  } catch (err) {
    try {
      const context = browser.contexts()[0];
      const page = context?.pages()[0];
      if (page) {
        await mkdir(LOGS_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const screenshotPath = join(LOGS_DIR, `jensonusa-enrich-error-${timestamp}.png`);
        await page.screenshot({ path: screenshotPath });
        console.error("Enrich screenshot saved to", screenshotPath);
      }
    } catch (screenshotErr) {
      console.error("Failed to save screenshot:", screenshotErr);
    }
    throw err;
  } finally {
    await browser.close();
  }
}
