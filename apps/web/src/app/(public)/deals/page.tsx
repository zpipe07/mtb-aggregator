import {
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchCategoryTree,
  DEFAULT_PAGE_SIZE,
  type FacetsResponse,
} from "@/api";
import { parseFilterParamsFromSearch } from "../../../lib/filterParams";
import { DealsPageContent } from "@/views/DealsPageContent";

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

  /** When a brand is selected, fetch facets again without `brand` so `brand_facets` lists all brands for the rest of the filters (matches faceted UX; avoids relying on a single response when cache/proxy differs). */
  const facetsForBrandOptionsPromise: Promise<FacetsResponse | null> =
    filterParams.brandFilter
      ? fetchFacets({ ...facetsParams, brand: undefined })
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
  const facetsBase = facetsResponse ?? {
    spec_facets: [],
    brand_facets: [],
    variant_facets: [],
    price_range: { min: 0, max: 0 },
    total_matching: 0,
  };
  const facets = {
    ...facetsBase,
    brand_facets:
      facetsForBrandOptions?.brand_facets ?? facetsBase.brand_facets,
  };

  return (
    <DealsPageContent
      deals={deals}
      totalCount={totalCount}
      facets={facets}
      stores={stores}
      categoryTree={categoryTree}
    />
  );
}
