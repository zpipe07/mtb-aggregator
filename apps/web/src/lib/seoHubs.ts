import { DEFAULT_PAGE_SIZE, fetchDeals } from "@/api";
import type { ParsedFilterParams } from "@/lib/filterParams";

/** Aligned with [docs/ideas/thedropper-distribution-seo.md](docs/ideas/thedropper-distribution-seo.md). */
export const SEO_HUB_MIN_INDEXABLE_DEALS = 5;

export type SeoHubFilter = {
  category_slug: string;
  brands?: string[];
  max_price?: number;
  min_price?: number;
  /** Default full-text search when the hub URL has no `q` param (merged server-side). */
  q?: string;
};

export type SeoHubFaqItem = {
  question: string;
  answer: string;
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
  /** Optional FAQ for hub uniqueness (indexed money pages). */
  faq?: SeoHubFaqItem[];
  /** Parent category path for crawlable context links (e.g. `/deals/c/bikes/mountain`). */
  parentCategoryPath?: string;
  /** Label for {@link parentCategoryPath} link text. */
  parentCategoryLabel?: string;
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
    title: "Mountain bikes on sale under $3,000",
    description:
      "Compare mountain bikes on sale under $3,000 across MTB retailers. Live trail, enduro, and XC deals updated throughout the day.",
    intro:
      "This list tracks mountain bikes currently on sale under $3,000 from shops we monitor—full-suspension and hardtail builds when retailers mark them down. Prices and inventory change as new scrapes run; use each listing to jump to the shop for current availability.",
    filters: { category_slug: "bikes-mountain", max_price: 3000 },
    relatedCategorySlugs: ["bikes-mountain", "bikes"],
    parentCategoryPath: "/deals/c/bikes/mountain",
    parentCategoryLabel: "All mountain bike deals",
    faq: [
      {
        question: "What mountain bikes show up in this list?",
        answer:
          "Complete mountain bikes—hardtails and full-suspension trail, enduro, and XC builds—listed at $3,000 or less at the time we last checked each retailer. We aggregate sale and closeout pricing from multiple bike shops, not a single store catalog.",
      },
      {
        question: "Are these prices guaranteed?",
        answer:
          "No. Sale prices and stock change quickly. Each card links to the retailer’s product page where you can confirm the current price, size, and availability before you buy.",
      },
      {
        question: "Hardtail or full suspension under $3,000?",
        answer:
          "Both appear when shops discount them into this price band. Hardtails often sit lower in the range; full-suspension deals near $3,000 tend to be prior-year models, direct-to-consumer builds, or limited closeouts.",
      },
      {
        question: "How often is this list updated?",
        answer:
          "We re-scrape retailer sale pages on a regular cadence (roughly every few hours). When a bike sells out or the price moves above $3,000, it may drop off the list on the next refresh.",
      },
    ],
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
  {
    slug: "mountain-bikes-under-1000",
    title: "Mountain bikes under $1,000",
    description:
      "Mountain bikes on sale under $1,000. Compare hardtail and entry-level full-suspension deals.",
    intro:
      "Budget MTB deals under a grand—hardtails and entry builds when shops mark them down.",
    filters: { category_slug: "bikes-mountain", max_price: 1000 },
    relatedCategorySlugs: ["bikes-mountain", "bikes"],
  },
  {
    slug: "mountain-bikes-under-500",
    title: "Mountain bikes under $500",
    description:
      "Mountain bikes under $500 on sale. Compare closeouts and budget builds across retailers.",
    intro:
      "Sub-$500 mountain bike deals—great for beginners or spare rigs.",
    filters: { category_slug: "bikes-mountain", max_price: 500 },
    relatedCategorySlugs: ["bikes-mountain", "bikes"],
  },
  {
    slug: "components-under-200",
    title: "MTB components under $200",
    description:
      "Mountain bike components on sale under $200. Compare parts deals across top retailers.",
    intro:
      "Component deals under $200—small upgrades and wear items at markdown prices.",
    filters: { category_slug: "components", max_price: 200 },
    relatedCategorySlugs: ["components"],
  },
  {
    slug: "wheels-under-300",
    title: "MTB wheels under $300",
    description:
      "Mountain bike wheels and wheelsets under $300. Compare sale prices across retailers.",
    intro:
      "Wheel deals under $300—rim, hub, and complete wheel markdowns in one feed.",
    filters: {
      category_slug: "components-wheels-tires",
      max_price: 300,
    },
    relatedCategorySlugs: [
      "components-wheels-tires",
      "components-wheels-tires-complete-wheels",
      "components",
    ],
  },
  {
    slug: "drivetrain-under-500",
    title: "MTB drivetrain deals under $500",
    description:
      "Mountain bike drivetrain components under $500. Cassettes, derailleurs, and groups on sale.",
    intro:
      "Drivetrain deals under $500—upgrade shifting without paying full retail.",
    filters: {
      category_slug: "components-drivetrain",
      max_price: 500,
    },
    relatedCategorySlugs: ["components-drivetrain", "components"],
  },
  {
    slug: "radial-tires",
    title: "Radial MTB tire deals",
    description:
      "Mountain bike tires with radial casing on sale. Compare radial tire discounts across MTB retailers on The Dropper.",
    intro:
      "Radial mountain bike tires when shops mark them down—lightweight casing builds common on trail and XC rubber.",
    filters: {
      category_slug: "components-wheels-tires-tires",
      q: "radial",
    },
    relatedCategorySlugs: [
      "components-wheels-tires-tires",
      "components-wheels-tires",
      "components",
    ],
    parentCategoryPath: "/deals/c/components/wheels-tires/tires",
    parentCategoryLabel: "All MTB tire deals",
    faq: [
      {
        question: "What is a radial mountain bike tire?",
        answer:
          "Radial tires use casing plies that run at roughly 90° to the tread direction. That layout can reduce weight and rolling resistance compared with traditional bias-ply casings. Many modern trail and XC tires advertise radial construction in the product name or specs.",
      },
      {
        question: "How is this list filtered?",
        answer:
          "We scope to the Tires category and match listings whose indexed product text includes “radial”—typically the casing type in the title or retailer description. Use the search box on this page to narrow further; prices and stock update as retailers change sales.",
      },
      {
        question: "Are radial tires only for XC?",
        answer:
          "No. Radial casings show up on trail and enduro tires too when brands want a lighter or more supple casing. Compare sizes, compounds, and prices on each card; the retailer page has the full spec sheet.",
      },
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

/** True when live inventory meets the indexable hub threshold. */
export async function hubEligible(hub: SeoHubDefinition): Promise<boolean> {
  const res = await fetchDeals({
    ...buildFetchDealsParamsFromHubAndFilters(hub, emptyParsedFilterParams()),
    limit: 1,
    offset: 0,
  });
  return hubMeetsIndexThreshold(res.total_count ?? 0);
}

/** Hub default `q` applies when the URL has no search; URL `q` overrides the hub default. */
export function resolveHubSearchQuery(
  hubFilter: SeoHubFilter,
  fp: ParsedFilterParams,
): string | undefined {
  const fromUrl = fp.searchQuery.trim();
  if (fromUrl) return fromUrl;
  const fromHub = hubFilter.q?.trim() ?? "";
  return fromHub || undefined;
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
    q: resolveHubSearchQuery(f, fp),
    sort: fp.sort,
    limit: DEFAULT_PAGE_SIZE,
    offset: fp.offset,
    specFilters:
      Object.keys(fp.specFilters).length > 0 ? fp.specFilters : undefined,
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
    maxPrice: "",
    excludeCategorySlug: "",
    specFilters: {},
    sort: "value",
    offset: 0,
  };
}
