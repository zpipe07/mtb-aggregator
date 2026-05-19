import { chromium as chromiumPlain, type Browser } from "playwright";
import { chromium as chromiumExtra } from "playwright-extra";
import { SCRAPER_HEADED } from "./config.js";
// @ts-ignore — no types shipped, plugin works at runtime
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(StealthPlugin());

const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT?.trim();
const BROWSER_WS_TOKEN =
  process.env.BROWSER_WS_TOKEN?.trim() || process.env.BROWSERLESS_TOKEN?.trim();

function getWsEndpoint(): string | undefined {
  if (!BROWSER_WS_ENDPOINT) return undefined;
  if (!BROWSER_WS_TOKEN) return BROWSER_WS_ENDPOINT;
  const url = new URL(BROWSER_WS_ENDPOINT);
  url.searchParams.set("token", BROWSER_WS_TOKEN);
  return url.toString();
}

/** Redact token from URL for safe logging */
function endpointForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("token")) {
      u.searchParams.set("token", "***");
    }
    return u.toString();
  } catch {
    return url.replace(/token=[^&\s]+/i, "token=***");
  }
}

/**
 * Get a browser instance. Default: launch Chromium locally (used on Render Standard 2GB).
 * Optional: set BROWSER_WS_ENDPOINT (and BROWSER_WS_TOKEN / BROWSERLESS_TOKEN if needed)
 * to connect to a remote CDP browser instead. Use runWithBrowser() so the browser is always closed.
 */
export async function getBrowser(): Promise<Browser> {
  const wsEndpoint = getWsEndpoint();
  if (wsEndpoint) {
    console.log(
      "[browser] Using remote browser:",
      endpointForLog(BROWSER_WS_ENDPOINT ?? ""),
      BROWSER_WS_TOKEN ? "(token from env)" : "(token in URL)"
    );
    // Browserless (and similar services) expose CDP; Playwright's connect() uses its own
    // wire protocol and will timeout. connectOverCDP is required for CDP endpoints.
    // Remote CDP browser: stealth is applied server-side, use plain playwright
    return chromiumPlain.connectOverCDP(wsEndpoint, {
      timeout: 90000,
    });
  }
  console.log(
    `[browser] Using local Chromium with stealth (BROWSER_WS_ENDPOINT not set, headless=${!SCRAPER_HEADED})`,
  );
  return chromiumExtra.launch({
    headless: !SCRAPER_HEADED,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

/**
 * Run a function with a browser instance. Launches Chromium locally by default;
 * connects to remote CDP when BROWSER_WS_ENDPOINT is set. Browser is always closed when done.
 */
export async function runWithBrowser<T>(
  fn: (browser: Browser) => Promise<T>
): Promise<T> {
  const browser = await getBrowser();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
