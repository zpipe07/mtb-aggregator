import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  fetchDeals,
  fetchFacets,
  fetchStores,
  fetchCategoryTree,
  normalizeFacetsResponse,
  type FacetsResponse,
} from "@/api";
import { parseFilterParamsFromSearch } from "@/lib/filterParams";
import { searchParamsRecordToDealsCategoryListPath } from "@/lib/dealsBackHref";
import { JsonLd } from "@/components/JsonLd";
import {
  buildFetchDealsParamsFromHubAndFilters,
  buildFetchFacetsParamsFromHubAndFilters,
  buildSeoHubPublicPath,
  emptyParsedFilterParams,
  getSeoHubBySlug,
  hubMeetsIndexThreshold,
} from "@/lib/seoHubs";
import { buildBreadcrumbJsonLd, buildProductItemListJsonLd, buildAggregateOfferJsonLd, buildFaqPageJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { SeoHubFaq } from "@/components/SeoHubFaq";
import { SeoHubRelatedLinks } from "@/components/SeoHubRelatedLinks";
import { DealsPageContent } from "@/views/DealsPageContent";
import HubDealsLoading from "./loading";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function hubDealCount(hubSlug: string): Promise<number> {
  const hub = getSeoHubBySlug(hubSlug);
  if (!hub) return 0;
  const res = await fetchDeals({
    ...buildFetchDealsParamsFromHubAndFilters(hub, emptyParsedFilterParams()),
    limit: 1,
    offset: 0,
  });
  return res.total_count ?? 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = getSeoHubBySlug(slug);
  if (!hub) {
    return { title: "Deals" };
  }
  const pathname = buildSeoHubPublicPath(slug);
  const total = await hubDealCount(slug);
  const indexable = hubMeetsIndexThreshold(total);
  const ogTitle = `${hub.title} | The Dropper`;
  return {
    title: hub.title,
    description: hub.description,
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    alternates: { canonical: pathname },
    openGraph: {
      title: ogTitle,
      description: hub.description,
      url: absoluteUrl(pathname),
      siteName: "The Dropper",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: hub.description,
    },
  };
}

export default async function SeoHubDealsPage({ params, searchParams }: Props) {
  const [{ slug }, paramsRecord] = await Promise.all([params, searchParams]);
  const hub = getSeoHubBySlug(slug);
  if (!hub) notFound();

  const pathname = buildSeoHubPublicPath(slug);
  const filterParams = parseFilterParamsFromSearch(paramsRecord);

  const dealsParams = buildFetchDealsParamsFromHubAndFilters(hub, filterParams);

  const facetsParams = buildFetchFacetsParamsFromHubAndFilters(hub, filterParams);

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

  const dealsListPath = searchParamsRecordToDealsCategoryListPath(
    pathname,
    paramsRecord,
  );

  const breadcrumbItems: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    { name: hub.title, path: pathname },
  ];

  const faqJsonLd =
    hub.faq && hub.faq.length > 0 ? buildFaqPageJsonLd(hub.faq) : null;

  return (
    <>
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd
        data={buildProductItemListJsonLd({
          name: hub.title,
          description: hub.description,
          totalCount,
          deals,
        })}
      />
      {facets.price_range.max > 0 ? (
        <JsonLd
          data={buildAggregateOfferJsonLd({
            name: hub.title,
            pageUrl: absoluteUrl(pathname),
            lowPrice: facets.price_range.min,
            highPrice: facets.price_range.max,
            offerCount: totalCount,
          })}
        />
      ) : null}
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}
      <Suspense fallback={<HubDealsLoading />}>
        <DealsPageContent
          deals={deals}
          totalCount={totalCount}
          facets={facets}
          stores={stores}
          categoryTree={categoryTree}
          dealsListPath={dealsListPath}
          categoryIntro={hub.intro}
        >
          {hub.faq?.length ? <SeoHubFaq items={hub.faq} /> : null}
          <SeoHubRelatedLinks hub={hub} />
        </DealsPageContent>
      </Suspense>
    </>
  );
}
