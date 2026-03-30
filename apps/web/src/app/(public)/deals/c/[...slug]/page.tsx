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
import { JsonLd } from "@/components/JsonLd";
import { findCategoryBySlug } from "@/lib/categoryTree";
import { categoryMetadataForSlug, getCategorySeo } from "@/lib/categorySeo";
import { buildItemListJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealsPageContent } from "@/views/DealsPageContent";

export const revalidate = 60;

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categorySlug = slug.join("-");
  const pathname = `/deals/c/${slug.join("/")}`;
  const tree = await fetchCategoryTree();
  if (!findCategoryBySlug(tree, categorySlug)) {
    return { title: "Category not found" };
  }
  const base = categoryMetadataForSlug(categorySlug);
  const ogTitle = `${base.title} | The Dropper`;
  return {
    ...base,
    alternates: { canonical: pathname },
    openGraph: {
      title: ogTitle,
      description: base.description ?? undefined,
      url: absoluteUrl(pathname),
      siteName: "The Dropper",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: base.description ?? undefined,
    },
  };
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

  const seo = getCategorySeo(categorySlug);

  return (
    <>
      <JsonLd
        data={buildItemListJsonLd({
          name: seo.title,
          description: seo.description,
          totalCount,
          deals: deals.map((d) => ({
            id: d.id,
            product_name: d.product_name,
          })),
        })}
      />
      <DealsPageContent
        deals={deals}
        totalCount={totalCount}
        facets={facets}
        stores={stores}
        categoryTree={categoryTree}
        dealsListPath={dealsListPath}
      />
    </>
  );
}
