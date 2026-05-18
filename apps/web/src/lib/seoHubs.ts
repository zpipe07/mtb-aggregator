import { DEFAULT_PAGE_SIZE } from "@/api";
import type { ParsedFilterParams } from "@/lib/filterParams";

/** Aligned with [docs/ideas/thedropper-distribution-seo.md](docs/ideas/thedropper-distribution-seo.md). */
export const SEO_HUB_MIN_INDEXABLE_DEALS = 5;

export type SeoHubFilter = {
  category_slug: string;
  brands?: string[];
  max_price?: number;
  min_price?: number;
};

export type SeoHubDefinition = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  filters: SeoHubFilter;
  /**
   * Show this hub in “Popular searches” on `/deals/c/…` when the page category slug matches.
   */
  relatedCategorySlugs: string[];
};

const HUBS: SeoHubDefinition[] = [
  {
    slug: "fox-forks",
    title: "Fox fork deals",
    description:
      "Compare sale prices on Fox mountain bike suspension forks. Shop discounts across retailers on The Dropper.",
    intro:
      "Browse Fox suspension fork deals in one place—trail, enduro, and DH options when shops mark them down.",
    filters: { category_slug: "components-suspension-forks", brands: ["Fox"] },
    relatedCategorySlugs: [
      "components-suspension-forks",
      "components-suspension",
    ],
  },
  {
    slug: "rockshox-forks",
    title: "RockShox fork deals",
    description:
      "Find RockShox fork sales and discounts. Compare prices across MTB retailers on The Dropper.",
    intro:
      "Track RockShox fork markdowns—Pike, Lyrik, ZEB, and more—aggregated from multiple shops.",
    filters: {
      category_slug: "components-suspension-forks",
      brands: ["RockShox"],
    },
    relatedCategorySlugs: [
      "components-suspension-forks",
      "components-suspension",
    ],
  },
  {
    slug: "forks-under-500",
    title: "MTB fork deals under $500",
    description:
      "Mountain bike suspension forks on sale under $500. Compare remaining inventory and closeouts.",
    intro:
      "Fork deals under $500: filtered to in-stock listings so you can spot real closeouts fast.",
    filters: { category_slug: "components-suspension-forks", max_price: 500 },
    relatedCategorySlugs: [
      "components-suspension-forks",
      "components-suspension",
    ],
  },
  {
    slug: "sram-brakes",
    title: "SRAM brake deals",
    description:
      "SRAM mountain bike brakes on sale—compare prices across retailers on The Dropper.",
    intro:
      "SRAM brake sets and hardware on markdown: trail and enduro stoppers in one feed.",
    filters: {
      category_slug: "components-brakes-brakesets",
      brands: ["SRAM"],
    },
    relatedCategorySlugs: ["components-brakes-brakesets", "components-brakes"],
  },
  {
    slug: "shimano-brakes",
    title: "Shimano brake deals",
    description:
      "Shimano MTB brakes on sale. Compare discounts from multiple bike shops.",
    intro:
      "Shimano brake deals—Deore, SLX, XT, XTR—when shops run sales we surface them here.",
    filters: {
      category_slug: "components-brakes-brakesets",
      brands: ["Shimano"],
    },
    relatedCategorySlugs: ["components-brakes-brakesets", "components-brakes"],
  },
  {
    slug: "brake-sets-under-200",
    title: "Mountain bike brakes under $200",
    description:
      "MTB brake sets and disc brakes under $200. Filtered deals across top retailers.",
    intro:
      "Brakes under $200: a budget-friendly view of current in-stock markdowns.",
    filters: {
      category_slug: "components-brakes-brakesets",
      max_price: 200,
    },
    relatedCategorySlugs: ["components-brakes-brakesets", "components-brakes"],
  },
  {
    slug: "mountain-bikes-under-3000",
    title: "Mountain bikes under $3,000",
    description:
      "Mountain bikes on sale under $3,000. Compare trail, enduro, and XC deals.",
    intro:
      "Full-suspension and hardtail MTBs under three grand—sale prices from shops we track.",
    filters: { category_slug: "bikes-mountain", max_price: 3000 },
    relatedCategorySlugs: ["bikes-mountain", "bikes"],
  },
  {
    slug: "complete-wheels-under-1000",
    title: "Complete wheelsets under $1,000",
    description:
      "Mountain bike wheelsets under $1,000. Compare builds and discounts across retailers.",
    intro:
      "Complete wheel deals under $1k—carbon and alloy builds when they hit sale pricing.",
    filters: {
      category_slug: "components-wheels-tires-complete-wheels",
      max_price: 1000,
    },
    relatedCategorySlugs: [
      "components-wheels-tires-complete-wheels",
      "components-wheels-tires",
      "components",
    ],
  },
];

export function listSeoHubs(): SeoHubDefinition[] {
  return HUBS;
}

export function getSeoHubBySlug(slug: string): SeoHubDefinition | undefined {
  const s = slug.trim();
  return HUBS.find((h) => h.slug === s);
}

export function buildSeoHubPublicPath(slug: string): string {
  return `/deals/hub/${slug.trim()}`;
}

export function hubMeetsIndexThreshold(totalCount: number): boolean {
  return totalCount >= SEO_HUB_MIN_INDEXABLE_DEALS;
}

function dedupeBrands(brands: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of brands) {
    const t = b.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Server-side: merge hub defaults with URL filter state (same pattern as category + query). */
export function buildFetchDealsParamsFromHubAndFilters(
  hub: SeoHubDefinition,
  fp: ParsedFilterParams,
) {
  const f = hub.filters;
  const mergedBrands = dedupeBrands([
    ...(f.brands ?? []),
    ...fp.brandFilters,
  ]);
  const minPriceNum = fp.minPrice ? parseFloat(fp.minPrice) : NaN;
  const minDiscountNum = fp.minDiscount ? parseFloat(fp.minDiscount) : NaN;

  return {
    category_slug: f.category_slug,
    brands: mergedBrands.length > 0 ? mergedBrands : undefined,
    max_price: f.max_price,
    min_price:
      !Number.isNaN(minPriceNum) && minPriceNum > 0 ? minPriceNum : undefined,
    min_discount:
      !Number.isNaN(minDiscountNum) && minDiscountNum > 0
        ? minDiscountNum
        : undefined,
    exclude_category_slug: fp.excludeCategorySlug || undefined,
    q: fp.searchQuery.trim() || undefined,
    sort: fp.sort,
    limit: DEFAULT_PAGE_SIZE,
    offset: fp.offset,
    specFilters:
      Object.keys(fp.specFilters).length > 0 ? fp.specFilters : undefined,
    variantFilters:
      Object.keys(fp.variantFilters).length > 0 ? fp.variantFilters : undefined,
    store: fp.storeFilter || undefined,
    group_variants: true as const,
  };
}

export function buildFetchFacetsParamsFromHubAndFilters(
  hub: SeoHubDefinition,
  fp: ParsedFilterParams,
) {
  const dealParams = buildFetchDealsParamsFromHubAndFilters(hub, fp);
  return {
    store: dealParams.store,
    brands: dealParams.brands,
    category_slug: dealParams.category_slug,
    min_discount: dealParams.min_discount,
    min_price: dealParams.min_price,
    max_price: dealParams.max_price,
    q: dealParams.q,
    specFilters: dealParams.specFilters,
    variantFilters: dealParams.variantFilters,
  };
}

/** For generateMetadata / sitemap count probes without URL filters. */
export function emptyParsedFilterParams(): ParsedFilterParams {
  return {
    searchQuery: "",
    storeFilter: "",
    brandFilters: [],
    categoryFilter: "",
    minDiscount: "",
    minPrice: "",
    excludeCategorySlug: "",
    specFilters: {},
    variantFilters: {},
    sort: "discount",
    offset: 0,
  };
}
