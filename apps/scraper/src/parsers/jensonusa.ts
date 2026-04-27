import { mkdir } from "fs/promises";
import { join } from "path";
import type { ScrapeResult } from "../types.js";
import { runWithBrowser } from "../browser.js";
import { USER_AGENT, SCRAPE_DELAY_MS, ENRICH_DELAY_MS } from "../config.js";
import {
  parseProductDtoVariants,
  type JensonProductDto,
} from "./jensonusa-dto.js";
import { parsePdpVariantsFromHtml, type PdpEnrichVariant } from "./jensonusa-pdp.js";

export interface EnrichResult {
  category_path: string[] | null;
  raw_specs: Record<string, string> | null;
  unavailable?: boolean;
  description?: string;
  /** PDP per-variant rows (JensonUSA only); API fans out to sibling listings. */
  variants?: PdpEnrichVariant[];
}

const BASE_URL = "https://www.jensonusa.com";
const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

const MAX_PAGES = Number(process.env.SCRAPER_MAX_PAGES) || 1; // Default 1; set higher for more pages
const PAGE_GOTO_RETRIES = 2;
const RETRY_DELAY_MS = 15000;

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
  return runWithBrowser(async (browser) => {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    try {
      // Use ps=100 for clearance to get more items per page (fewer page requests)
      let currentUrl = url;
      if (url.includes("jensonusa.com/clearance") && !url.includes("ps=")) {
        currentUrl = url.includes("?") ? `${url}&ps=100` : `${url}?ps=100`;
      }

      const allResults: ScrapeResult[] = [];
      let pageNum = 0;

      while (pageNum < MAX_PAGES) {
        pageNum++;
        console.log(
          `[scraper] JensonUSA page ${pageNum}: fetching ${currentUrl}`,
        );

        let gotoOk = false;
        for (let attempt = 1; attempt <= PAGE_GOTO_RETRIES + 1; attempt++) {
          try {
            await page.goto(currentUrl, { waitUntil: "load", timeout: 60000 });
            gotoOk = true;
            break;
          } catch (gotoErr) {
            const msg =
              gotoErr instanceof Error ? gotoErr.message : String(gotoErr);
            console.warn(
              `[scraper] page.goto attempt ${attempt} failed: ${msg}`,
            );
            if (attempt <= PAGE_GOTO_RETRIES) {
              console.log(`[scraper] retrying in ${RETRY_DELAY_MS / 1000}s...`);
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            } else {
              console.warn(
                `[scraper] giving up on page ${pageNum}, returning ${allResults.length} results so far`,
              );
              break;
            }
          }
        }
        if (!gotoOk) break;

        // Wait for dynamic content (products often load via JS after initial render)
        await new Promise((r) => setTimeout(r, 8000));

        // Polite delay before scraping
        await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

        // Extract raw DTO + container text from each card. Parsing happens in Node via parseProductDtoVariants
        // (one row per variants[] entry when present) so we can unit-test DTO shape changes.
        const extractScript = `
      const parsePriceFromText = (text) => {
        const m = (text || '').replace(/,/g, '').match(/\\$?([\\d.]+)/);
        return m ? parseFloat(m[1]) : null;
      };
      const raw = [];
      const productCards = document.querySelectorAll("[data-product-result-dto]");
      for (const card of productCards) {
        const dtoStr = card.getAttribute("data-product-result-dto");
        if (!dtoStr) continue;
        try {
          const dto = JSON.parse(dtoStr.replace(/&quot;/g, '"'));
          const container = card.closest(".list-item") || card;
          const containerText = (container && container.textContent) || "";
          const img = container ? container.querySelector("img") : null;
          const imageUrlFromDom = img && img.src && !img.src.startsWith("data:") ? img.src : null;
          raw.push({ dto, containerText, imageUrlFromDom });
        } catch (e) { continue; }
      }
      if (raw.length === 0) {
        const baseUrl = "https://www.jensonusa.com";
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
          const img = container ? container.querySelector("img") : null;
          const imageUrlFromDom = img && img.src && !img.src.startsWith("data:") ? img.src : null;
          if (currentPrice && currentPrice > 0 && currentPrice < 100000) {
            const dto = { name, url: href, code: pathClean, listPrice: { amount: currentPrice } };
            raw.push({ dto, containerText, imageUrlFromDom });
          }
        }
      }
      return { raw };
    `;

        const extracted = (await page.evaluate(
          `(function() { ${extractScript} })()`,
        )) as {
          raw: Array<{
            dto: JensonProductDto;
            containerText: string;
            imageUrlFromDom: string | null;
          }>;
        };

        const results: ScrapeResult[] = [];
        for (const { dto, containerText, imageUrlFromDom } of extracted.raw) {
          const rows = parseProductDtoVariants(
            dto,
            containerText,
            imageUrlFromDom,
          );
          for (const parsed of rows) {
            results.push({
              store_sku: parsed.sku,
              product_name: parsed.name,
              current_price: parsed.currentPrice!,
              original_price: parsed.originalPrice,
              product_url: parsed.url,
              image_url: parsed.imageUrl,
              brand: parsed.brand,
              category_path: parsed.category_path,
              is_in_stock: true,
              ...(parsed.productGroupKey
                ? { product_group_key: parsed.productGroupKey }
                : {}),
              ...(parsed.variantOptions
                ? { variant_options: parsed.variantOptions }
                : {}),
            });
          }
        }

        allResults.push(...results);
        const nextUrl = buildNextPageUrl(currentUrl);
        console.log(
          `[scraper] JensonUSA page ${pageNum}: got ${results.length} listings, nextPageUrl=${nextUrl ?? "none"}, total=${allResults.length} (MAX_PAGES=${MAX_PAGES})`,
        );

        if (pageNum >= MAX_PAGES || results.length < 48 || !nextUrl) {
          break;
        }
        currentUrl = nextUrl;
        await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));
      }

      const deduped = deduplicateBySku(allResults);
      console.log(
        `[scraper] JensonUSA done: ${deduped.length} listings after dedup`,
      );
      warnIfNoOriginalPrice(deduped, "JensonUSA");
      return deduped;
    } catch (err) {
      try {
        const context = browser.contexts()[0];
        const page = context?.pages()[0];
        if (page) {
          await mkdir(LOGS_DIR, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const screenshotPath = join(
            LOGS_DIR,
            `jensonusa-error-${timestamp}.png`,
          );
          await page.screenshot({ path: screenshotPath });
          console.error("Screenshot saved to", screenshotPath);
        }
      } catch (screenshotErr) {
        console.error("Failed to save screenshot:", screenshotErr);
      }
      throw err;
    }
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

/** Warn when we got many results but none have original_price - likely a DTO field change. */
function warnIfNoOriginalPrice(results: ScrapeResult[], store: string): void {
  const withOriginal = results.filter((r) => r.original_price != null).length;
  const threshold = 10;
  if (results.length >= threshold && withOriginal === 0) {
    console.warn(
      `[scraper] WARNING: ${results.length} ${store} listings scraped but 0 have original_price (MSRP). ` +
        `Check that the DTO uses msrpPrice - the site may have changed structure.`,
    );
    if (process.env.SCRAPER_STRICT_ORIGINAL_PRICE === "1") {
      throw new Error(
        `Scrape failed: no original_price in ${results.length} results. Set SCRAPER_STRICT_ORIGINAL_PRICE=0 to warn only.`,
      );
    }
  }
}

/** Extract category and raw specs from PDP. JensonUSA uses breadcrumb links and a specs table/section. */
export async function enrichJensonUSA(
  productUrl: string,
): Promise<EnrichResult> {
  return runWithBrowser(async (browser) => {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();
    try {
      await page.goto(productUrl, { waitUntil: "load", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));

      const isUnavailable = await page.evaluate(() => {
        return document.body.innerText.includes("This item is unavailable");
      });
      if (isUnavailable) {
        console.log(
          `[scraper] jensonusa enrich: product unavailable ${productUrl}`,
        );
        return { category_path: null, raw_specs: null, unavailable: true };
      }

      const script = `
        (function() {
          function extractBreadcrumb() {
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
                      if (name) items.push(String(name));
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
            var trimmed = items.slice(0, -1);
            if (trimmed[0] && /^home$/i.test(trimmed[0])) {
              trimmed = trimmed.slice(1);
            }
            return trimmed.length > 0 ? trimmed : null;
          }

          function cleanText(input) {
            return (input || '').replace(/\\s+/g, ' ').trim();
          }

          function collectFromTable(table, acc) {
            var rows = table.querySelectorAll('tr');
            for (var i = 0; i < rows.length; i++) {
              var cells = rows[i].children;
              if (cells.length < 2) continue;
              var key = cleanText(cells[0].textContent);
              var value = cleanText(cells[1].textContent);
              if (!key || !value) continue;
              if (key.length > 80 || value.length > 200) continue;
              acc[key] = value;
            }
          }

          function collectFromDl(dl, acc) {
            var terms = dl.querySelectorAll('dt');
            for (var i = 0; i < terms.length; i++) {
              var term = terms[i];
              var def = term.nextElementSibling;
              if (!def || def.tagName.toLowerCase() !== 'dd') continue;
              var key = cleanText(term.textContent);
              var value = cleanText(def.textContent);
              if (!key || !value) continue;
              if (key.length > 80 || value.length > 200) continue;
              acc[key] = value;
            }
          }

          function extractSpecs() {
            var specs = {};
            var tableSelectors = [
              'section[id*=\"spec\"] table',
              'section[class*=\"spec\"] table',
              'div[id*=\"spec\"] table',
              'div[class*=\"spec\"] table',
              'table[class*=\"spec\"]',
              'table[summary*=\"Spec\"]'
            ];

            var tableSet = [];
            function addTable(t) {
              if (tableSet.indexOf(t) === -1) tableSet.push(t);
            }

            for (var s = 0; s < tableSelectors.length; s++) {
              var sel = tableSelectors[s];
              var found = document.querySelectorAll(sel);
              for (var f = 0; f < found.length; f++) {
                addTable(found[f]);
              }
            }

            if (tableSet.length === 0) {
              var allTables = document.querySelectorAll('table');
              for (var a = 0; a < allTables.length; a++) {
                var t = allTables[a];
                var prev = t.previousElementSibling;
                var label = cleanText(prev && prev.textContent ? prev.textContent : '');
                if (label.toLowerCase().indexOf('spec') !== -1) {
                  addTable(t);
                }
              }
            }

            for (var ti = 0; ti < tableSet.length; ti++) {
              collectFromTable(tableSet[ti], specs);
            }

            if (Object.keys(specs).length === 0) {
              var dls = document.querySelectorAll('dl');
              for (var di = 0; di < dls.length; di++) {
                var dl = dls[di];
                var prevEl = dl.previousElementSibling;
                var label2 = cleanText(prevEl && prevEl.textContent ? prevEl.textContent : '');
                if (label2.toLowerCase().indexOf('spec') !== -1) {
                  collectFromDl(dl, specs);
                }
              }
            }

            return Object.keys(specs).length > 0 ? specs : null;
          }

          function extractDescription() {
            var sel = [
              '#product-description',
              '[itemprop="description"]'
            ];
            for (var si = 0; si < sel.length; si++) {
              var el = document.querySelector(sel[si]);
              if (el) {
                var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
                if (t && t.length > 50 && t.length < 12000) return t;
              }
            }
            return null;
          }

          return {
            categoryPath: extractBreadcrumb(),
            rawSpecs: extractSpecs(),
            description: extractDescription()
          };
        })()
      `;

      const result = (await page.evaluate(script)) as {
        categoryPath: string[] | null;
        rawSpecs: Record<string, string> | null;
        description: string | null;
      };

      const html = await page.content();
      const variants = parsePdpVariantsFromHtml(html);

      await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));

      return {
        category_path: result.categoryPath,
        raw_specs: result.rawSpecs,
        description: result.description ?? undefined,
        ...(variants.length > 0 ? { variants } : {}),
      };
    } catch (err) {
      try {
        const ctx = browser.contexts()[0];
        const p = ctx?.pages()[0];
        if (p) {
          await mkdir(LOGS_DIR, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const screenshotPath = join(
            LOGS_DIR,
            `jensonusa-enrich-error-${timestamp}.png`,
          );
          await p.screenshot({ path: screenshotPath });
          console.error("Enrich screenshot saved to", screenshotPath);
        }
      } catch (screenshotErr) {
        console.error("Failed to save screenshot:", screenshotErr);
      }
      throw err;
    }
  });
}
