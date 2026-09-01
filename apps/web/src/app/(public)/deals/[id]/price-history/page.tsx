import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchDeal,
  fetchPriceHistory,
  fetchCategoryTree,
} from "@/api";
import { JsonLd } from "@/components/JsonLd";
import {
  categorySlugFromCanonicalPath,
  findCategoryWithAncestors,
} from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { buildBreadcrumbJsonLd, buildProductJsonLd } from "@/lib/jsonLd";
import { computeDealScore, pricePositionLabel } from "@/lib/dealScore";
import { buildDealPriceHistoryMetadata, missingDealMetadata } from "@/lib/dealPageMetadata";

/** 4h — must match {@link PUBLIC_ISR_REVALIDATE_SECONDS} in @/lib/revalidate. */
export const revalidate = 14400;

const MIN_HISTORY_POINTS = 2;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return { ...missingDealMetadata, title: "Price tracker" };
  try {
    const [deal, priceHistory] = await Promise.all([
      fetchDeal(dealId),
      fetchPriceHistory(dealId),
    ]);
    const position = pricePositionLabel(deal, priceHistory);
    return buildDealPriceHistoryMetadata(deal, {
      descriptionSuffix: position ? ` — ${position.toLowerCase()}` : "",
    });
  } catch {
    return { ...missingDealMetadata, title: "Price tracker" };
  }
}

export default async function DealPriceHistoryPage({ params }: Props) {
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
    deal.canonical_category,
  );
  const score = computeDealScore(deal, priceHistory);
  const position = pricePositionLabel(deal, priceHistory);
  const path = `/deals/${dealId}/price-history`;

  const breadcrumbItems: { name: string; path: string }[] = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    { name: deal.product_name, path: `/deals/${dealId}` },
    { name: "Price tracker", path },
  ];
  if (categorySlug != null) {
    const found = findCategoryWithAncestors(categoryTree, categorySlug);
    if (found) {
      breadcrumbItems.splice(2, 0, {
        name: found.node.name,
        path: buildDealsCategoryPath(categorySlug, categoryTree),
      });
    }
  }

  const hasHistory =
    priceHistory != null && priceHistory.points.length >= MIN_HISTORY_POINTS;

  return (
    <>
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumbItems)} />
      <JsonLd data={buildProductJsonLd(deal, priceHistory)} />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {"// price tracker"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {deal.product_name} price tracker
        </h1>
        {deal.brand ? (
          <p className="mt-1 text-sm text-muted-foreground">{deal.brand}</p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Current
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              ${deal.current_price.toFixed(2)}
            </p>
          </div>
          {priceHistory ? (
            <>
              <div className="rounded-sm border border-border bg-card p-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Historical low
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                  ${priceHistory.lowest_price.toFixed(2)}
                </p>
              </div>
              <div className="rounded-sm border border-border bg-card p-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Deal score
                </p>
                <p className="mt-1 text-lg font-semibold">{score.displayLabel}</p>
              </div>
            </>
          ) : null}
        </div>

        {position ? (
          <p className="mt-4 text-sm text-muted-foreground">{position}</p>
        ) : null}

        {hasHistory ? (
          <div className="mt-8 space-y-2">
            <h2 className="text-lg font-semibold">Price history</h2>
            <ul className="divide-y divide-border rounded-sm border border-border">
              {[...priceHistory!.points].reverse().slice(0, 20).map((p) => (
                <li
                  key={p.recorded_at}
                  className="flex items-center justify-between px-4 py-2 font-mono text-sm tabular-nums"
                >
                  <span className="text-muted-foreground">
                    {new Date(p.recorded_at).toLocaleDateString()}
                  </span>
                  <span>${p.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            Price history is still building for this listing. Check back after a
            few scrape cycles.
          </p>
        )}

        <p className="mt-8">
          <Link
            href={`/deals/${dealId}`}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            View full deal details →
          </Link>
        </p>
      </div>
    </>
  );
}
