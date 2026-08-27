import type { Metadata } from "next";
import { Suspense } from "react";
import {
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchCategoryTree,
  DEFAULT_PAGE_SIZE,
  normalizeFacetsResponse,
  type FacetsResponse,
} from "@/api";
import { parseFilterParamsFromSearch, parsePriceParam } from "../../../lib/filterParams";
import { searchParamsRecordToDealsListPath } from "@/lib/dealsBackHref";
import { JsonLd } from "@/components/JsonLd";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealsPageContent } from "@/views/DealsPageContent";
import { SeoHubLinksGlobal } from "@/components/SeoHubLinks";
import { BrandLinksGlobal } from "@/components/BrandLinks";
import DealsLoading from "./loading";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

const dealsDescription =
  "Browse all mountain bike deals. Filter by category, brand, price, and specs to find your next ride at the best price.";

export const metadata: Metadata = {
  title: "All mountain bike deals",
  description: dealsDescription,
  alternates: {
    canonical: "/deals",
  },
  openGraph: {
    title: "All mountain bike deals | The Dropper",
    description: dealsDescription,
    url: absoluteUrl("/deals"),
  },
  twitter: {
    title: "All mountain bike deals | The Dropper",
    description: dealsDescription,
  },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filterParams = parseFilterParamsFromSearch(params);

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset: filterParams.offset,
    store: filterParams.storeFilter || undefined,
    brands:
      filterParams.brandFilters.length > 0
        ? filterParams.brandFilters
        : undefined,
    category_slug: filterParams.categoryFilter || undefined,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    min_price: parsePriceParam(filterParams.minPrice),
    max_price: parsePriceParam(filterParams.maxPrice),
    exclude_category_slug: filterParams.excludeCategorySlug || undefined,
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
    sort: filterParams.sort,
    group_variants: true,
  };

  const facetsParams = {
    store: filterParams.storeFilter || undefined,
    brands:
      filterParams.brandFilters.length > 0
        ? filterParams.brandFilters
        : undefined,
    category_slug: filterParams.categoryFilter || undefined,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    min_price: parsePriceParam(filterParams.minPrice),
    max_price: parsePriceParam(filterParams.maxPrice),
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
  };

  /** When a brand is selected, fetch facets again without `brand` so `brand_facets` lists all brands for the rest of the filters (matches faceted UX; avoids relying on a single response when cache/proxy differs). */
  const facetsForBrandOptionsPromise: Promise<FacetsResponse | null> =
    filterParams.brandFilters.length > 0
      ? fetchFacets({ ...facetsParams, brands: undefined })
      : Promise.resolve(null);

  const [dealsResponse, facetsResponse, facetsForBrandOptions, stores, categoryTree] =
    await Promise.all([
      fetchDeals(dealsParams),
      fetchFacets(facetsParams),
      facetsForBrandOptionsPromise,
      fetchStores(),
      fetchCategoryTree(),
    ]);

  const deals = dealsResponse.deals ?? [];
  const totalCount = dealsResponse.total_count ?? 0;
  const facets = normalizeFacetsResponse(
    facetsResponse,
    facetsForBrandOptions?.brand_facets,
  );

  const dealsListPath = searchParamsRecordToDealsListPath(params);

  const itemListDeals = deals.map((d) => ({
    id: d.id,
    product_name: d.product_name,
  }));

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "All mountain bike deals", path: "/deals" },
        ])}
      />
      <JsonLd
        data={buildItemListJsonLd({
          name: "All mountain bike deals",
          description: dealsDescription,
          totalCount,
          deals: itemListDeals,
        })}
      />
      <Suspense fallback={<DealsLoading />}>
        <DealsPageContent
          deals={deals}
          totalCount={totalCount}
          facets={facets}
          stores={stores}
          categoryTree={categoryTree}
          dealsListPath={dealsListPath}
        >
          <SeoHubLinksGlobal title="Popular deal searches" />
          <BrandLinksGlobal brandFacets={facets.brand_facets} />
        </DealsPageContent>
      </Suspense>
    </>
  );
}
