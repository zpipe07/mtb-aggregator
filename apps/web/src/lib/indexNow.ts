/**
 * IndexNow (Bing and other participating engines).
 *
 * The key is public by design: engines fetch it from the site root to verify
 * ownership. Submit only from Vercel Production for the apex host.
 *
 * @see https://www.indexnow.org/documentation
 */

export const INDEXNOW_HOST = "thedropper.shop";
export const INDEXNOW_KEY = "5130963c54f0f6fab8dede8ea6f6e38c";
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}${INDEXNOW_KEY_PATH}`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Cap per trigger so cron stays inside the serverless budget (IndexNow max is 10,000). */
export const INDEXNOW_MAX_URLS_PER_RUN = 2_000;

/** Core / money URLs to ping on every successful production run. */
export const INDEXNOW_CORE_PATHS = [
  "/",
  "/deals",
  "/categories",
  "/giveaways",
  "/deals/c/bikes/mountain",
  "/deals/c/bikes/emtb",
  "/deals/hub/mountain-bikes-under-3000",
  "/deals/hub/emtbs-under-5000",
] as const;

const SKIP_PATH_PREFIXES = ["/admin", "/cron", "/links", "/api"];

export type IndexNowEnv = {
  VERCEL_ENV?: string;
  INDEXNOW_SUBMIT?: string;
  [key: string]: string | undefined;
};

export type SubmitIndexNowResult =
  | { status: "skipped"; reason: string }
  | { status: "empty"; reason: string }
  | { status: "submitted"; urlCount: number; httpStatus: number }
  | { status: "error"; message: string; httpStatus?: number };

export function isIndexNowEnabled(env: IndexNowEnv = process.env): boolean {
  const submit = env.INDEXNOW_SUBMIT?.trim().toLowerCase();
  if (submit === "0" || submit === "false" || submit === "off") {
    return false;
  }
  // Preview / local / CI never notify engines — even if SITE_URL is production.
  return env.VERCEL_ENV === "production";
}

export function indexNowUrlForPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, `https://${INDEXNOW_HOST}`).toString();
}

export function coreIndexNowUrls(): string[] {
  return INDEXNOW_CORE_PATHS.map((path) => indexNowUrlForPath(path));
}

/**
 * Keep only apex https URLs. Strips query/hash. Drops admin, cron, link-in-bio,
 * API proxy, and noindex price-history pages.
 */
export function canonicalizeIndexNowUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      url = new URL(trimmed);
    } else {
      const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      url = new URL(path, `https://${INDEXNOW_HOST}`);
    }
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.hostname !== INDEXNOW_HOST) return null;

  const path = url.pathname || "/";
  if (SKIP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  if (path.endsWith("/price-history")) return null;

  url.hash = "";
  url.search = "";
  return url.toString();
}

export function uniqueIndexNowUrls(inputs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const input of inputs) {
    const canonical = canonicalizeIndexNowUrl(input);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
    if (out.length >= INDEXNOW_MAX_URLS_PER_RUN) break;
  }
  return out;
}

export type SubmitIndexNowOptions = {
  env?: IndexNowEnv;
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

export async function submitIndexNow(
  urls: string[],
  options: SubmitIndexNowOptions = {},
): Promise<SubmitIndexNowResult> {
  const env = options.env ?? process.env;
  if (!isIndexNowEnabled(env)) {
    return { status: "skipped", reason: "not production" };
  }

  const urlList = uniqueIndexNowUrls(urls);
  if (urlList.length === 0) {
    return { status: "empty", reason: "no eligible urls" };
  }

  const endpoint = options.endpoint ?? INDEXNOW_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList,
  };

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    // 200 = accepted; 202 = received, key validation pending.
    if (res.status === 200 || res.status === 202) {
      return {
        status: "submitted",
        urlCount: urlList.length,
        httpStatus: res.status,
      };
    }
    const detail = await res.text().catch(() => "");
    return {
      status: "error",
      message: `IndexNow HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "IndexNow request failed",
    };
  }
}

export function isRecentScrape(
  lastScraped: string | undefined,
  lookbackMs: number,
  now: Date,
): boolean {
  if (!lastScraped) return true;
  const ts = Date.parse(lastScraped);
  if (Number.isNaN(ts)) return true;
  return now.getTime() - ts <= lookbackMs;
}
