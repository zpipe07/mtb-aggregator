import { notFound } from "next/navigation";
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
import {
  listingHasExtraFilters,
  parseFilterParamsFromSearch,
  parsePriceParam,
} from "@/lib/filterParams";
import { searchParamsRecordToDealsCategoryListPath } from "@/lib/dealsBackHref";
import { JsonLd } from "@/components/JsonLd";
import {
  categoryHasDeals,
  findCategoryBySlug,
  findCategoryWithAncestors,
  shopperListingTotalCount,
} from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { categoryMetadataForSlug, getCategorySeo } from "@/lib/categorySeo";
import { buildBreadcrumbJsonLd, buildProductItemListJsonLd, buildAggregateOfferJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealsPageContent } from "@/views/DealsPageContent";
import { SeoHubLinksForCategory } from "@/components/SeoHubLinks";
import { CategoryBrandLinks } from "@/components/BrandLinks";
import CategoryDealsLoading from "./loading";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categorySlug = slug.join("-");
  const tree = await fetchCategoryTree();
  const categoryNode = findCategoryBySlug(tree, categorySlug);
  if (!categoryNode) {
    return { title: "Category not found" };
  }
  const pathname = buildDealsCategoryPath(categorySlug, tree);
  const base = categoryMetadataForSlug(categorySlug);
  const ogTitle = `${base.title} | The Dropper`;
  const emptyCategory = !categoryHasDeals(categoryNode);
  return {
    ...base,
    ...(emptyCategory ? { robots: { index: false, follow: true } } : {}),
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
  const categorySlug = slugSegments.join("-");

  const categoryTree = await fetchCategoryTree();
  const categoryNode = findCategoryBySlug(categoryTree, categorySlug);
  if (!categoryNode) notFound();
  const pathname = buildDealsCategoryPath(categorySlug, categoryTree);

  const filterParams = parseFilterParamsFromSearch(paramsRecord);
  const extraFilters = listingHasExtraFilters(filterParams);

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset: filterParams.offset,
    store: filterParams.storeFilter || undefined,
    brands:
      filterParams.brandFilters.length > 0
        ? filterParams.brandFilters
        : undefined,
    category_slug: categorySlug,
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
    stableTotalCount: extraFilters,
  };

  const facetsParams = {
    store: filterParams.storeFilter || undefined,
    brands:
      filterParams.brandFilters.length > 0
        ? filterParams.brandFilters
        : undefined,
    category_slug: categorySlug,
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
  };

  const facetsForBrandOptionsPromise: Promise<FacetsResponse | null> =
    filterParams.brandFilters.length > 0
      ? fetchFacets({ ...facetsParams, brands: undefined })
      : Promise.resolve(null);

  const [dealsResponse, facetsResponse, facetsForBrandOptions, stores] =
    await Promise.all([
      fetchDeals(dealsParams),
      fetchFacets(facetsParams),
      facetsForBrandOptionsPromise,
      fetchStores(),
    ]);

  const deals = dealsResponse.deals ?? [];
  const totalCount = shopperListingTotalCount(
    dealsResponse.total_count ?? 0,
    categoryNode,
    extraFilters,
  );
  const facets = normalizeFacetsResponse(
    facetsResponse,
    facetsForBrandOptions?.brand_facets,
  );

  const dealsListPath = searchParamsRecordToDealsCategoryListPath(
    pathname,
    paramsRecord
  );

  const seo = getCategorySeo(categorySlug);

  const breadcrumbItems: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
  ];
  const foundCat = findCategoryWithAncestors(categoryTree, categorySlug);
  if (foundCat) {
    for (const a of foundCat.ancestors) {
      breadcrumbItems.push({
        name: a.name,
        path: buildDealsCategoryPath(a.slug, categoryTree),
      });
    }
    breadcrumbItems.push({
      name: foundCat.node.name,
      path: pathname,
    });
  } else {
    breadcrumbItems.push({ name: categorySlug, path: pathname });
  }

  return (
    <>
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd
        data={buildProductItemListJsonLd({
          name: seo.title,
          description: seo.description,
          totalCount,
          deals,
        })}
      />
      {facets.price_range.max > 0 ? (
        <JsonLd
          data={buildAggregateOfferJsonLd({
            name: seo.title,
            pageUrl: absoluteUrl(pathname),
            lowPrice: facets.price_range.min,
            highPrice: facets.price_range.max,
            offerCount: totalCount,
          })}
        />
      ) : null}
      <Suspense fallback={<CategoryDealsLoading />}>
        <DealsPageContent
          deals={deals}
          totalCount={totalCount}
          facets={facets}
          stores={stores}
          categoryTree={categoryTree}
          dealsListPath={dealsListPath}
          categoryIntro={seo.intro}
          belowIntro={
            <SeoHubLinksForCategory categorySlug={categorySlug} />
          }
        >
          <CategoryBrandLinks
            categorySlug={categorySlug}
            categoryTree={categoryTree}
            brandFacets={facets.brand_facets}
          />
        </DealsPageContent>
      </Suspense>
    </>
  );
}
