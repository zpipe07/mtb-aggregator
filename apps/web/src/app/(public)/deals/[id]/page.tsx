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
import { buildBreadcrumbJsonLd, buildProductJsonLd } from "@/lib/jsonLd";
import {
  buildDealDetailMetadata,
  missingDealMetadata,
} from "@/lib/dealPageMetadata";
import { RelatedDeals } from "@/components/RelatedDeals";
import { DealDetailContent } from "./DealDetailContent";
import DealDetailLoading from "./loading";

/** 4h — must match PUBLIC_ISR_REVALIDATE_SECONDS in @/lib/revalidate (literal required by Next.js). */
export const revalidate = 14400;

/**
 * Empty on purpose: prerendering every deal at build time would time out.
 * Next.js only ISR-caches dynamic `[id]` routes when this export exists;
 * `revalidate` alone leaves the page `private, no-store`.
 */
export function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return missingDealMetadata;
  try {
    const deal = await fetchDeal(dealId);
    // Canonical is always `/deals/{id}` — request query strings (e.g. `?from=`)
    // are not passed in and must not appear on the indexable URL.
    return buildDealDetailMetadata(deal);
  } catch {
    return missingDealMetadata;
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
      <JsonLd data={buildProductJsonLd(deal, priceHistory)} />
      <Suspense fallback={<DealDetailLoading />}>
        <DealDetailContent
          deal={deal}
          priceHistory={priceHistory ?? undefined}
          categoryTree={categoryTree}
          categoryBrowseHref={categoryBrowseHref}
          categoryBrowseLabel={categoryBrowseLabel}
        />
        <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
          <RelatedDeals deal={deal} categorySlug={categorySlug ?? undefined} />
        </div>
      </Suspense>
    </>
  );
}
