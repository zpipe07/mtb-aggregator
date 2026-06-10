import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchDeal, fetchPriceHistory, fetchCategoryTree } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import {
  categoryPathLabelFromSlug,
  categorySlugFromCanonicalPath,
  findCategoryWithAncestors,
} from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import {
  buildBreadcrumbJsonLd,
  buildDealProductDescription,
  buildProductJsonLd,
} from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealDetailContent } from "./DealDetailContent";
import DealDetailLoading from "./loading";

/** 4h — must match PUBLIC_ISR_REVALIDATE_SECONDS in @/lib/revalidate (literal required by Next.js). */
export const revalidate = 14400;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return { title: "Deal not found" };
  try {
    const deal = await fetchDeal(dealId);
    const path = `/deals/${dealId}`;
    const titleSegment = `${deal.product_name}${deal.brand ? ` | ${deal.brand}` : ""}`;
    const description = buildDealProductDescription(deal);
    const canonical = absoluteUrl(path);
    const ogImages = deal.image_url
      ? [{ url: deal.image_url, alt: deal.product_name }]
      : [{ url: "/the-dropper-logo-horizontal.png", alt: deal.product_name }];

    return {
      title: titleSegment,
      description,
      alternates: { canonical: path },
      openGraph: {
        title: `${titleSegment} | The Dropper`,
        description,
        url: canonical,
        siteName: "The Dropper",
        type: "article",
        images: ogImages,
      },
      twitter: {
        card: "summary_large_image",
        title: `${titleSegment} | The Dropper`,
        description,
        images: deal.image_url
          ? [deal.image_url]
          : ["/the-dropper-logo-horizontal.png"],
      },
    };
  } catch {
    return { title: "Deal not found" };
  }
}

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) notFound();

  const [deal, priceHistory, categoryTree] = await Promise.all([
    fetchDeal(dealId).catch(() => null),
    fetchPriceHistory(dealId).catch(() => null),
    fetchCategoryTree().catch(() => []),
  ]);

  if (!deal) notFound();

  const categorySlug = categorySlugFromCanonicalPath(
    categoryTree,
    deal.canonical_category
  );
  const categoryBrowseHref =
    categorySlug != null
      ? buildDealsCategoryPath(categorySlug, categoryTree)
      : undefined;
  const categoryBrowseLabel =
    categorySlug != null
      ? categoryPathLabelFromSlug(categoryTree, categorySlug) ?? undefined
      : undefined;

  const breadcrumbItems: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
  ];
  if (categorySlug != null) {
    const found = findCategoryWithAncestors(categoryTree, categorySlug);
    if (found) {
      for (const a of found.ancestors) {
        breadcrumbItems.push({
          name: a.name,
          path: buildDealsCategoryPath(a.slug, categoryTree),
        });
      }
      breadcrumbItems.push({
        name: found.node.name,
        path: buildDealsCategoryPath(categorySlug, categoryTree),
      });
    }
  }
  breadcrumbItems.push({
    name: deal.product_name,
    path: `/deals/${deal.id}`,
  });

  return (
    <>
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={buildProductJsonLd(deal)} />
      <Suspense fallback={<DealDetailLoading />}>
        <DealDetailContent
          deal={deal}
          priceHistory={priceHistory ?? undefined}
          categoryTree={categoryTree}
          categoryBrowseHref={categoryBrowseHref}
          categoryBrowseLabel={categoryBrowseLabel}
        />
      </Suspense>
    </>
  );
}
