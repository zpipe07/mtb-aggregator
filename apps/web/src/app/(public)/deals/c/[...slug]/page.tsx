import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchCategoryTree,
  DEFAULT_PAGE_SIZE,
  type FacetsResponse,
} from "@/api";
import { parseFilterParamsFromSearch } from "@/lib/filterParams";
import { searchParamsRecordToDealsCategoryListPath } from "@/lib/dealsBackHref";
import { findCategoryBySlug } from "@/lib/categoryTree";
import { categoryMetadataForSlug } from "@/lib/categorySeo";
import { DealsPageContent } from "@/views/DealsPageContent";

export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categorySlug = slug.join("-");
  const tree = await fetchCategoryTree();
  if (!findCategoryBySlug(tree, categorySlug)) {
    return { title: "Category not found" };
  }
  return categoryMetadataForSlug(categorySlug);
}

export default async function CategoryDealsPage({ params, searchParams }: Props) {
  const [{ slug: slugSegments }, paramsRecord] = await Promise.all([
    params,
    searchParams,
  ]);
  const pathname = `/deals/c/${slugSegments.join("/")}`;
  const categorySlug = slugSegments.join("-");

  const categoryTree = await fetchCategoryTree();
  if (!findCategoryBySlug(categoryTree, categorySlug)) notFound();

  const filterParams = parseFilterParamsFromSearch(paramsRecord);

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset: filterParams.offset,
    store: filterParams.storeFilter || undefined,
    brand: filterParams.brandFilter || undefined,
    category_slug: categorySlug,
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
    category_slug: categorySlug,
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

  const facetsForBrandOptionsPromise: Promise<FacetsResponse | null> =
    filterParams.brandFilter
      ? fetchFacets({ ...facetsParams, brand: undefined })
      : Promise.resolve(null);

  const [dealsResponse, facetsResponse, facetsForBrandOptions, stores] =
    await Promise.all([
      fetchDeals(dealsParams),
      fetchFacets(facetsParams),
      facetsForBrandOptionsPromise,
      fetchStores(),
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

  const dealsListPath = searchParamsRecordToDealsCategoryListPath(
    pathname,
    paramsRecord
  );

  return (
    <DealsPageContent
      deals={deals}
      totalCount={totalCount}
      facets={facets}
      stores={stores}
      categoryTree={categoryTree}
      dealsListPath={dealsListPath}
    />
  );
}
