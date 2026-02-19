import { mkdir } from "fs/promises";
import { join } from "path";
import { chromium } from "playwright";
import type { ScrapeResult } from "../types.js";
import { USER_AGENT, SCRAPE_DELAY_MS } from "../config.js";

const BASE_URL = "https://www.jensonusa.com";
const LOGS_DIR = process.env.SCREENSHOT_DIR ?? join(process.cwd(), "logs");

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
    await page.goto(url, { waitUntil: "load", timeout: 60000 });

    // Wait for dynamic content (products often load via JS after initial render)
    await new Promise((r) => setTimeout(r, 8000));

    // Polite delay before scraping
    await new Promise((r) => setTimeout(r, SCRAPE_DELAY_MS));

    // Use string to avoid tsx/transpiler adding __name or other helpers that break in browser context
    // JensonUSA uses data-product-result-dto with JSON: { name, url, code, selectedVariant: { listPrice: { amount } } }
    const extractScript = `
      const parsePriceFromText = (text) => {
        const m = (text || '').replace(/,/g, '').match(/\\$?([\\d.]+)/);
        return m ? parseFloat(m[1]) : null;
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
          const imageUrl = img ? img.src : null;
          let originalPrice = null;
          if (dto.selectedVariant && dto.selectedVariant.originalPrice) {
            originalPrice = dto.selectedVariant.originalPrice.amount;
          }
          if (!originalPrice && dto.originalPrice) originalPrice = dto.originalPrice.amount;
          if (currentPrice && currentPrice > 0 && currentPrice < 100000) {
            results.push({ sku, name, url, currentPrice, originalPrice, imageUrl });
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
          const imageUrl = img ? img.src : null;
          if (currentPrice && currentPrice > 0 && currentPrice < 100000) {
            results.push({ sku: pathClean, name, url: href, currentPrice, originalPrice, imageUrl });
          }
        }
      }
      return results;
    `;

    const rawResults = (await page.evaluate(
      `(function() { ${extractScript} })()`
    )) as Array<{
      sku: string;
      name: string;
      url: string;
      currentPrice: number | null;
      originalPrice: number | null;
      imageUrl: string | null;
    }>;

    const results: ScrapeResult[] = rawResults.map((r) => ({
      store_sku: r.sku,
      product_name: r.name,
      current_price: r.currentPrice!,
      original_price: r.originalPrice,
      product_url: r.url,
      image_url: r.imageUrl,
      is_in_stock: true,
    }));

    return deduplicateBySku(results);
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
