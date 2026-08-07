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

/** Idle time before closing a shared browser between sequential enrich/scrape calls. */
const BROWSER_IDLE_CLOSE_MS =
  Number(process.env.BROWSER_IDLE_CLOSE_MS) || 60_000;

let sharedBrowser: Browser | null = null;
let sharedBrowserUsers = 0;
let sharedBrowserIdleTimer: ReturnType<typeof setTimeout> | null = null;

async function acquireSharedBrowser(): Promise<Browser> {
  if (sharedBrowserIdleTimer) {
    clearTimeout(sharedBrowserIdleTimer);
    sharedBrowserIdleTimer = null;
  }
  if (sharedBrowser?.isConnected()) {
    sharedBrowserUsers++;
    return sharedBrowser;
  }
  sharedBrowser = await getBrowser();
  sharedBrowserUsers = 1;
  return sharedBrowser;
}

function releaseSharedBrowser(): void {
  sharedBrowserUsers = Math.max(0, sharedBrowserUsers - 1);
  if (sharedBrowserUsers > 0 || !sharedBrowser) {
    return;
  }
  sharedBrowserIdleTimer = setTimeout(() => {
    sharedBrowserIdleTimer = null;
    if (sharedBrowserUsers > 0 || !sharedBrowser) {
      return;
    }
    void sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }, BROWSER_IDLE_CLOSE_MS);
}

/**
 * Run a function with a browser instance. Reuses one browser across sequential calls
 * (closes after BROWSER_IDLE_CLOSE_MS idle). Launches locally by default; connects to
 * remote CDP when BROWSER_WS_ENDPOINT is set.
 */
export async function runWithBrowser<T>(
  fn: (browser: Browser) => Promise<T>
): Promise<T> {
  const browser = await acquireSharedBrowser();
  try {
    return await fn(browser);
  } finally {
    releaseSharedBrowser();
  }
}
