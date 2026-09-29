import type { MetadataRoute } from "next";
import { fetchCategoryTree, fetchDeals, fetchFacets } from "@/api";
import { filterCategoryTreeWithDeals } from "@/lib/categoryTree";
import { allDealsCategoryPathsFromTree } from "@/lib/dealsCategoryPath";
import { absoluteUrl } from "@/lib/siteUrl";
import {
  brandMeetsIndexThreshold,
  brandToSlug,
  buildBrandDealsPath,
} from "@/lib/brandPages";
import {
  listSeoHubs,
  hubMeetsIndexThreshold,
  buildFetchDealsParamsFromHubAndFilters,
  emptyParsedFilterParams,
  buildSeoHubPublicPath,
} from "@/lib/seoHubs";

/** 4h CDN freshness for `/sitemap.xml`. Must match PUBLIC_ISR_REVALIDATE_SECONDS. */
export const SITEMAP_CDN_MAX_AGE_SECONDS = 14_400;

/**
 * Browser stays uncached; Vercel CDN holds the XML so crawlers don't rerun
 * the paginated catalog fetch on every hit. The body can exceed Next's 2MB
 * data-cache item limit, so this is an HTTP cache, not `unstable_cache`.
 */
export const SITEMAP_RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": `public, s-maxage=${SITEMAP_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=86400`,
  "Vercel-CDN-Cache-Control": `public, s-maxage=${SITEMAP_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=86400`,
};

/** Keep each deals page under Next.js's ~2MB data-cache limit (~3KB/deal). */
const DEAL_PAGE_SIZE = 500;
/** Parallel deal pages per batch during sitemap generation. */
const DEAL_FETCH_BATCH = 4;
/** Google’s per-sitemap URL limit; leave headroom for static + category URLs. */
const MAX_DEAL_URLS_IN_SITEMAP = 48_000;

async function appendDealDetailUrls(
  entries: MetadataRoute.Sitemap,
): Promise<void> {
  const probe = await fetchDeals({
    limit: 1,
    offset: 0,
    sort: "newest",
    group_variants: true,
    noStore: true,
  });
  const cappedTotal = Math.min(
    probe.total_count ?? 0,
    MAX_DEAL_URLS_IN_SITEMAP,
  );
  if (cappedTotal === 0) return;

  const totalPages = Math.ceil(cappedTotal / DEAL_PAGE_SIZE);
  let dealUrls = 0;

  for (let batchStart = 0; batchStart < totalPages; batchStart += DEAL_FETCH_BATCH) {
    const batchSize = Math.min(DEAL_FETCH_BATCH, totalPages - batchStart);
    const responses = await Promise.all(
      Array.from({ length: batchSize }, (_, i) =>
        fetchDeals({
          limit: DEAL_PAGE_SIZE,
          offset: (batchStart + i) * DEAL_PAGE_SIZE,
          sort: "newest",
          group_variants: true,
          noStore: true,
        }),
      ),
    );

    for (const res of responses) {
      for (const d of res.deals ?? []) {
        if (dealUrls >= MAX_DEAL_URLS_IN_SITEMAP) return;
        entries.push({
          url: absoluteUrl(`/deals/${d.id}`),
          lastModified: d.last_scraped ? new Date(d.last_scraped) : undefined,
          changeFrequency: "weekly",
          priority: 0.5,
        });
        dealUrls += 1;
      }
    }
  }
}

export async function buildSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/deals"),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/categories"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/giveaways"),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/policies"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/returns"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    const tree = await fetchCategoryTree();
    for (const path of allDealsCategoryPathsFromTree(
      filterCategoryTreeWithDeals(tree),
    )) {
      entries.push({
        url: absoluteUrl(path),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // API unavailable during build — keep static entries only
  }

  try {
    const hubs = listSeoHubs();
    const hubChecks = await Promise.all(
      hubs.map(async (hub) => {
        const res = await fetchDeals({
          ...buildFetchDealsParamsFromHubAndFilters(
            hub,
            emptyParsedFilterParams(),
          ),
          limit: 1,
          offset: 0,
          noStore: true,
        });
        const total = res.total_count ?? 0;
        if (!hubMeetsIndexThreshold(total)) return null;
        return buildSeoHubPublicPath(hub.slug);
      }),
    );
    for (const path of hubChecks) {
      if (path == null) continue;
      entries.push({
        url: absoluteUrl(path),
        changeFrequency: "daily",
        priority: 0.75,
      });
    }
  } catch {
    // Skip hub URLs if API is down
  }

  try {
    await appendDealDetailUrls(entries);
  } catch {
    // Skip deal URLs if API is down
  }

  try {
    const facets = await fetchFacets({ noStore: true });
    for (const b of facets.brand_facets ?? []) {
      if (!brandMeetsIndexThreshold(b.count)) continue;
      entries.push({
        url: absoluteUrl(buildBrandDealsPath(brandToSlug(b.value))),
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  } catch {
    // Skip brand URLs if API is down
  }

  return entries;
}

/** Same shape as Next's metadata sitemap XML (loc, lastmod, changefreq, priority). */
export function sitemapEntriesToXml(entries: MetadataRoute.Sitemap): string {
  let content = '<?xml version="1.0" encoding="UTF-8"?>\n';
  content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const item of entries) {
    content += "<url>\n";
    content += `<loc>${item.url}</loc>\n`;
    if (item.lastModified) {
      const serialized =
        item.lastModified instanceof Date
          ? item.lastModified.toISOString()
          : item.lastModified;
      content += `<lastmod>${serialized}</lastmod>\n`;
    }
    if (item.changeFrequency) {
      content += `<changefreq>${item.changeFrequency}</changefreq>\n`;
    }
    if (typeof item.priority === "number") {
      content += `<priority>${item.priority}</priority>\n`;
    }
    content += "</url>\n";
  }
  content += "</urlset>\n";
  return content;
}
