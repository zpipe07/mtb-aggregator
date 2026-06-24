import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  fetchBrands,
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchCategoryTree,
  DEFAULT_PAGE_SIZE,
} from "@/api";
import { parseFilterParamsFromSearch } from "@/lib/filterParams";
import { searchParamsRecordToDealsCategoryListPath } from "@/lib/dealsBackHref";
import { JsonLd } from "@/components/JsonLd";
import {
  brandMeetsIndexThreshold,
  buildBrandCategoryDealsPath,
  buildBrandDealsPath,
  resolveBrandFromSlug,
} from "@/lib/brandPages";
import {
  brandCategoryMetadata,
  getBrandCategorySeo,
} from "@/lib/brandSeo";
import {
  buildAggregateOfferJsonLd,
  buildBreadcrumbJsonLd,
  buildProductItemListJsonLd,
} from "@/lib/jsonLd";
import { findCategoryBySlug, findCategoryWithAncestors } from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealsPageContent } from "@/views/DealsPageContent";
import BrandCategoryDealsLoading from "./loading";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

type Props = {
  params: Promise<{ slug: string; slugSegments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function brandCategoryDealCount(
  brand: string,
  categorySlug: string,
): Promise<number> {
  const res = await fetchDeals({
    brands: [brand],
    category_slug: categorySlug,
    limit: 1,
    offset: 0,
    group_variants: true,
  });
  return res.total_count ?? 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, slugSegments } = await params;
  const categorySlug = slugSegments.join("-");
  const brands = await fetchBrands().catch(() => []);
  const brand = resolveBrandFromSlug(slug, brands);
  const tree = await fetchCategoryTree().catch(() => []);
  const categoryNode = brand
    ? findCategoryBySlug(tree, categorySlug)
    : undefined;
  if (!brand || !categoryNode) return { title: "Deals" };

  const categoryPath = buildDealsCategoryPath(categorySlug, tree);
  const pathname = buildBrandCategoryDealsPath(slug, categoryPath);
  const total = await brandCategoryDealCount(brand, categorySlug);
  const indexable = brandMeetsIndexThreshold(total);
  const base = brandCategoryMetadata(brand, categoryNode.name);
  const ogTitle = `${base.title} | The Dropper`;
  return {
    ...base,
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
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

export default async function BrandCategoryDealsPage({
  params,
  searchParams,
}: Props) {
  const [{ slug, slugSegments }, paramsRecord] = await Promise.all([
    params,
    searchParams,
  ]);
  const categorySlug = slugSegments.join("-");

  const [brands, categoryTree] = await Promise.all([
    fetchBrands().catch(() => []),
    fetchCategoryTree(),
  ]);
  const brand = resolveBrandFromSlug(slug, brands);
  if (!brand) notFound();
  const categoryNode = findCategoryBySlug(categoryTree, categorySlug);
  if (!categoryNode) notFound();

  const categoryPath = buildDealsCategoryPath(categorySlug, categoryTree);
  const pathname = buildBrandCategoryDealsPath(slug, categoryPath);
  const filterParams = parseFilterParamsFromSearch(paramsRecord);

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset: filterParams.offset,
    store: filterParams.storeFilter || undefined,
    brands: [brand],
    category_slug: categorySlug,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    min_price: filterParams.minPrice
      ? parseFloat(filterParams.minPrice) || undefined
      : undefined,
    exclude_category_slug: filterParams.excludeCategorySlug || undefined,
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
    sort: filterParams.sort,
    group_variants: true as const,
  };

  const facetsParams = {
    store: filterParams.storeFilter || undefined,
    brands: [brand],
    category_slug: categorySlug,
    min_discount: filterParams.minDiscount
      ? parseFloat(filterParams.minDiscount) || undefined
      : undefined,
    specFilters:
      Object.keys(filterParams.specFilters).length > 0
        ? filterParams.specFilters
        : undefined,
    q: filterParams.searchQuery.trim() || undefined,
  };

  const [dealsResponse, facetsResponse, stores] = await Promise.all([
    fetchDeals(dealsParams),
    fetchFacets(facetsParams),
    fetchStores(),
  ]);

  const deals = dealsResponse.deals ?? [];
  const totalCount = dealsResponse.total_count ?? 0;
  const facets = facetsResponse ?? {
    spec_facets: [],
    brand_facets: [],
    price_range: { min: 0, max: 0 },
    total_matching: 0,
  };
  const seo = getBrandCategorySeo(brand, categoryNode.name);

  const dealsListPath = searchParamsRecordToDealsCategoryListPath(
    pathname,
    paramsRecord,
  );

  const breadcrumbItems: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    { name: `${brand} deals`, path: buildBrandDealsPath(slug) },
  ];
  const foundCat = findCategoryWithAncestors(categoryTree, categorySlug);
  if (foundCat) {
    for (const a of foundCat.ancestors) {
      breadcrumbItems.push({
        name: a.name,
        path: buildBrandCategoryDealsPath(
          slug,
          buildDealsCategoryPath(a.slug, categoryTree),
        ),
      });
    }
    breadcrumbItems.push({ name: foundCat.node.name, path: pathname });
  } else {
    breadcrumbItems.push({ name: categoryNode.name, path: pathname });
  }

  const priceRange = facets.price_range;

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
      {priceRange.max > 0 ? (
        <JsonLd
          data={buildAggregateOfferJsonLd({
            name: seo.title,
            pageUrl: absoluteUrl(pathname),
            lowPrice: priceRange.min,
            highPrice: priceRange.max,
            offerCount: totalCount,
          })}
        />
      ) : null}
      <Suspense fallback={<BrandCategoryDealsLoading />}>
        <DealsPageContent
          deals={deals}
          totalCount={totalCount}
          facets={facets}
          stores={stores}
          categoryTree={categoryTree}
          dealsListPath={dealsListPath}
          categoryIntro={seo.intro}
        />
      </Suspense>
    </>
  );
}
