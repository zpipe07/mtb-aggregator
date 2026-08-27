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
  normalizeFacetsResponse,
  type FacetsResponse,
} from "@/api";
import { parseFilterParamsFromSearch, parsePriceParam } from "@/lib/filterParams";
import { searchParamsRecordToDealsCategoryListPath } from "@/lib/dealsBackHref";
import { JsonLd } from "@/components/JsonLd";
import {
  brandMeetsIndexThreshold,
  buildBrandDealsPath,
  resolveBrandFromSlug,
} from "@/lib/brandPages";
import { brandMetadataForName, getBrandSeo } from "@/lib/brandSeo";
import {
  buildAggregateOfferJsonLd,
  buildBreadcrumbJsonLd,
  buildProductItemListJsonLd,
} from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { BrandCategoryLinks } from "@/components/BrandLinks";
import { DealsPageContent } from "@/views/DealsPageContent";
import BrandDealsLoading from "./loading";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function brandDealCount(brand: string): Promise<number> {
  const res = await fetchDeals({
    brands: [brand],
    limit: 1,
    offset: 0,
    group_variants: true,
  });
  return res.total_count ?? 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brands = await fetchBrands().catch(() => []);
  const brand = resolveBrandFromSlug(slug, brands);
  if (!brand) return { title: "Brand not found" };
  const pathname = buildBrandDealsPath(slug);
  const total = await brandDealCount(brand);
  const indexable = brandMeetsIndexThreshold(total);
  const base = brandMetadataForName(brand);
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

export default async function BrandDealsPage({ params, searchParams }: Props) {
  const [{ slug }, paramsRecord] = await Promise.all([params, searchParams]);
  const brands = await fetchBrands().catch(() => []);
  const brand = resolveBrandFromSlug(slug, brands);
  if (!brand) notFound();

  const pathname = buildBrandDealsPath(slug);
  const filterParams = parseFilterParamsFromSearch(paramsRecord);

  const dealsParams = {
    limit: DEFAULT_PAGE_SIZE,
    offset: filterParams.offset,
    store: filterParams.storeFilter || undefined,
    brands: [brand],
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
    group_variants: true as const,
  };

  const facetsParams = {
    store: filterParams.storeFilter || undefined,
    brands: [brand],
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

  const [dealsResponse, facetsResponse, stores, categoryTree] = await Promise.all([
    fetchDeals(dealsParams),
    fetchFacets(facetsParams),
    fetchStores(),
    fetchCategoryTree(),
  ]);

  const deals = dealsResponse.deals ?? [];
  const totalCount = dealsResponse.total_count ?? 0;
  const facets = normalizeFacetsResponse(facetsResponse);
  const seo = getBrandSeo(brand);

  const dealsListPath = searchParamsRecordToDealsCategoryListPath(
    pathname,
    paramsRecord,
  );

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    { name: `${brand} deals`, path: pathname },
  ];

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
      <Suspense fallback={<BrandDealsLoading />}>
        <DealsPageContent
          deals={deals}
          totalCount={totalCount}
          facets={facets}
          stores={stores}
          categoryTree={categoryTree}
          dealsListPath={dealsListPath}
          categoryIntro={seo.intro}
        >
          <BrandCategoryLinks
            brand={brand}
            brandSlug={slug}
            categoryTree={categoryTree}
          />
        </DealsPageContent>
      </Suspense>
    </>
  );
}
