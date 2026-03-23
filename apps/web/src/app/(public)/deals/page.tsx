import { Suspense } from "react";
import {
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchBrands,
  fetchCategoryTree,
  DEFAULT_PAGE_SIZE,
} from "@/api";
import { parseFilterParamsFromSearch } from "../../../lib/filterParams";
import { DealsPageContent } from "@/views/DealsPageContent";
import { LoadingState } from "@/components/LoadingState";

export const revalidate = 60;

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
    brand: filterParams.brandFilter || undefined,
    category_slug: filterParams.categoryFilter || undefined,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    variantFilters:
      Object.keys(filterParams.variantFilters).length > 0
        ? filterParams.variantFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
    sort: filterParams.sort,
    group_variants: true,
  };

  const facetsParams = {
    store: filterParams.storeFilter || undefined,
    brand: filterParams.brandFilter || undefined,
    category_slug: filterParams.categoryFilter || undefined,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    variantFilters:
      Object.keys(filterParams.variantFilters).length > 0
        ? filterParams.variantFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
  };

  const [dealsResponse, facetsResponse, stores, brands, categoryTree] =
    await Promise.all([
      fetchDeals(dealsParams),
      fetchFacets(facetsParams),
      fetchStores(),
      fetchBrands(),
      fetchCategoryTree(),
    ]);

  const deals = dealsResponse.deals ?? [];
  const totalCount = dealsResponse.total_count ?? 0;
  const facets = facetsResponse ?? {
    spec_facets: [],
    brand_facets: [],
    variant_facets: [],
    price_range: { min: 0, max: 0 },
    total_matching: 0,
  };

  return (
    <Suspense fallback={<LoadingState />}>
      <DealsPageContent
        deals={deals}
        totalCount={totalCount}
        facets={facets}
        stores={stores}
        brands={brands}
        categoryTree={categoryTree}
      />
    </Suspense>
  );
}
