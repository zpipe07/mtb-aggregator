/** Jenson /sale cards use ps=100; stop when a page looks like a remainder. */
export const JENSON_MIN_FULL_PAGE = 48;

/** Floor when only SCRAPER_MAX_PAGES is set (prod is 10, which truncates /sale). */
export const DEFAULT_JENSON_MAX_PAGES = 50;

const TRUNCATED = Symbol("jensonScrapeTruncated");

type TruncatableResults = { [TRUNCATED]?: boolean };

/** Stamp results so POST /scrape can set X-Scrape-Truncated without changing JSON. */
export function markJensonScrapeTruncated<T extends object>(results: T): T {
  (results as TruncatableResults)[TRUNCATED] = true;
  return results;
}

export function isJensonScrapeTruncated(results: unknown): boolean {
  return Boolean(results && (results as TruncatableResults)[TRUNCATED]);
}

export function jensonMaxPages(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const specific = Number(env.JENSON_MAX_PAGES);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const global = Number(env.SCRAPER_MAX_PAGES);
  if (Number.isFinite(global) && global >= DEFAULT_JENSON_MAX_PAGES) return global;
  return DEFAULT_JENSON_MAX_PAGES;
}

/** Build next /sale page URL. Jenson pn is zero-indexed: pn=0 is page 1. */
export function buildJensonNextPageUrl(currentUrl: string): string | null {
  if (!currentUrl.includes("jensonusa.com/sale")) return null;
  try {
    const u = new URL(currentUrl);
    const pn = parseInt(u.searchParams.get("pn") || "0", 10);
    u.searchParams.set("pn", String(pn + 1));
    return u.toString();
  } catch {
    return null;
  }
}

export function jensonShouldFetchNextPage(args: {
  pageNum: number;
  maxPages: number;
  lastPageListingCount: number;
  nextUrl: string | null;
}): boolean {
  if (!args.nextUrl) return false;
  if (args.lastPageListingCount < JENSON_MIN_FULL_PAGE) return false;
  if (args.pageNum >= args.maxPages) return false;
  return true;
}

export function jensonScrapeTruncated(args: {
  pageNum: number;
  maxPages: number;
  lastPageListingCount: number;
  nextUrl: string | null;
}): boolean {
  return (
    args.pageNum >= args.maxPages &&
    args.lastPageListingCount >= JENSON_MIN_FULL_PAGE &&
    args.nextUrl != null
  );
}
