import type { MetadataRoute } from "next";
import { DEAL_DETAIL_PATH } from "@/lib/dealPageMetadata";
import { absoluteUrl } from "@/lib/siteUrl";

/** Google’s per-sitemap URL limit; leave headroom for static + category URLs. */
export const MAX_DEAL_URLS_IN_SITEMAP = 48_000;

export type SitemapDealRow = {
  id: number;
  last_scraped?: string | null;
};

/** Positive integer listing IDs only — never missing/placeholder rows. */
export function isIndexableSitemapDealId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

/**
 * Apex, query-free sitemap loc. Drops www, search, and hash. Returns null for
 * noindex surfaces (price-history) or non-path input.
 */
export function canonicalSitemapUrl(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.includes("/price-history")) return null;

  let url: URL;
  try {
    url = new URL(absoluteUrl(trimmed.split("?")[0] ?? trimmed));
  } catch {
    return null;
  }
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Deal detail sitemap rows from the indexable-listings API (or fallback page). */
export function dealDetailSitemapEntries(
  deals: SitemapDealRow[],
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const d of deals) {
    if (entries.length >= MAX_DEAL_URLS_IN_SITEMAP) break;
    if (!isIndexableSitemapDealId(d.id)) continue;
    const path = `/deals/${d.id}`;
    if (!DEAL_DETAIL_PATH.test(path)) continue;
    const url = canonicalSitemapUrl(path);
    if (!url) continue;
    entries.push({
      url,
      lastModified: d.last_scraped ? new Date(d.last_scraped) : undefined,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }
  return entries;
}
