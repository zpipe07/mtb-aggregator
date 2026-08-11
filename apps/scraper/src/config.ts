/** Used for plain HTTP fetch enrichers (Shopify JSON, etc.). */
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { startupLogger } from "./logging.js";

export const USER_AGENT =
  "MTBDealBot/1.0 (+https://github.com/mtb-aggregator; contact for bot info)";

/** Playwright / WAF-protected sites (Backcountry family). Override via BROWSER_USER_AGENT. */
export const BROWSER_USER_AGENT =
  process.env.BROWSER_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Raw env value (for logs). */
export const SCRAPER_STORAGE_STATE_RAW = process.env.SCRAPER_STORAGE_STATE?.trim() || "";

/** Resolve SCRAPER_STORAGE_STATE to an absolute path (cwd, then monorepo root). */
export function resolveScraperStorageState(raw = SCRAPER_STORAGE_STATE_RAW): string {
  if (!raw) return "";
  if (isAbsolute(raw)) return raw;
  const fromCwd = resolve(process.cwd(), raw);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRepoRoot = resolve(process.cwd(), "../..", raw);
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  return fromCwd;
}

/** Resolved path for load/save (absolute when possible). */
export const SCRAPER_STORAGE_STATE = resolveScraperStorageState();

/** Path to pass to Playwright only when the file exists (missing file must not crash enrich). */
export function scraperStorageStateLoadPath(): string {
  if (!SCRAPER_STORAGE_STATE) return "";
  return existsSync(SCRAPER_STORAGE_STATE) ? SCRAPER_STORAGE_STATE : "";
}

export function logScraperStorageStateConfig(): void {
  if (!SCRAPER_STORAGE_STATE_RAW) return;
  const loadPath = scraperStorageStateLoadPath();
  startupLogger.info({
    msg: "scraper storage state configured",
    env: SCRAPER_STORAGE_STATE_RAW,
    resolved: SCRAPER_STORAGE_STATE,
    cwd: process.cwd(),
    load: loadPath || "(file missing — enrich will run without saved cookies)",
  });
}

/** Max ms to wait for WAF challenge to clear before giving up (default 120s). */
export const SCRAPER_WAF_WAIT_MS = Math.max(
  0,
  Number(process.env.SCRAPER_WAF_WAIT_MS) || 120_000,
);

/** Set SCRAPER_HEADED=1 to launch a visible browser (sometimes passes WAF when headless fails). */
export const SCRAPER_HEADED =
  process.env.SCRAPER_HEADED === "1" || process.env.SCRAPER_HEADED === "true";

export const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS) || 5000;

export const ENRICH_DELAY_MS = Number(process.env.ENRICH_DELAY_MS) || 5000;

/** Max wall-clock time for a single POST /enrich call (default 120s). */
export const ENRICH_TIMEOUT_MS = Math.max(
  0,
  Number(process.env.ENRICH_TIMEOUT_MS) || 120_000,
);

/** Limit total products per scrape when set (convenient for testing). 0 = no limit. */
export const SCRAPER_MAX_PRODUCTS = Math.max(
  0,
  Number(process.env.SCRAPER_MAX_PRODUCTS) || 0,
);

export const STORE_SELECTORS: Record<
  string,
  {
    product_card: string;
    product_name: string;
    product_link: string;
    current_price: string;
    original_price?: string;
    image_url?: string;
  }
> = {
  jensonusa: {
    product_card: ".product-tile, .product-item, [data-product-id], article.product",
    product_name: "a.product-name, .product-title, h2 a, h3 a, a[href*='jensonusa.com']",
    product_link: "a[href*='jensonusa.com'][href*='/']",
    current_price: ".price, .product-price, [data-price], .sale-price",
    original_price: ".msrp, .original-price, .compare-at-price",
    image_url: "img.product-image, img[data-product]",
  },
};
