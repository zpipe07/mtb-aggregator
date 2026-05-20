import type { MetadataRoute } from "next";
import { fetchCategoryTree, fetchDeals } from "@/api";
import { filterCategoryTreeWithDeals } from "@/lib/categoryTree";
import { allDealsCategoryPathsFromTree } from "@/lib/dealsCategoryPath";
import { SITEMAP_REVALIDATE_SECONDS } from "@/lib/revalidate";
import { absoluteUrl } from "@/lib/siteUrl";
import {
  listSeoHubs,
  hubMeetsIndexThreshold,
  buildFetchDealsParamsFromHubAndFilters,
  emptyParsedFilterParams,
  buildSeoHubPublicPath,
} from "@/lib/seoHubs";

export const revalidate = SITEMAP_REVALIDATE_SECONDS;

const DEAL_PAGE_SIZE = 5000;
/** Google’s per-sitemap URL limit; leave headroom for static + category URLs. */
const MAX_DEAL_URLS_IN_SITEMAP = 48_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
    let offset = 0;
    let dealUrls = 0;
    for (;;) {
      const res = await fetchDeals({
        limit: DEAL_PAGE_SIZE,
        offset,
        sort: "newest",
        group_variants: true,
      });
      const deals = res.deals ?? [];
      if (deals.length === 0) break;
      for (const d of deals) {
        if (dealUrls >= MAX_DEAL_URLS_IN_SITEMAP) break;
        entries.push({
          url: absoluteUrl(`/deals/${d.id}`),
          changeFrequency: "weekly",
          priority: 0.5,
        });
        dealUrls += 1;
      }
      if (dealUrls >= MAX_DEAL_URLS_IN_SITEMAP) break;
      if (deals.length < DEAL_PAGE_SIZE) break;
      offset += DEAL_PAGE_SIZE;
    }
  } catch {
    // Skip deal URLs if API is down
  }

  return entries;
}
