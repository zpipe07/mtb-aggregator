import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchDeal, fetchPriceHistory } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { sanitizeDealsListBackHref } from "@/lib/dealsBackHref";
import { buildProductJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { DealDetailContent } from "./DealDetailContent";

export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return { title: "Deal not found" };
  try {
    const deal = await fetchDeal(dealId);
    const path = `/deals/${dealId}`;
    const titleSegment = `${deal.product_name}${deal.brand ? ` | ${deal.brand}` : ""}`;
    const priceStr = `$${deal.current_price.toFixed(2)}`;
    const orig =
      deal.original_price != null && deal.original_price > deal.current_price
        ? ` (was $${deal.original_price.toFixed(2)})`
        : "";
    const discount =
      deal.discount_pct != null && deal.discount_pct > 0
        ? ` — ${Math.round(deal.discount_pct)}% off`
        : "";
    const description = `${priceStr} at ${deal.store_name}${orig}${discount}. Compare MTB deals on The Dropper.`;
    const canonical = absoluteUrl(path);
    const ogImages = deal.image_url
      ? [{ url: deal.image_url, alt: deal.product_name }]
      : undefined;

    return {
      title: titleSegment,
      description,
      alternates: { canonical: path },
      openGraph: {
        title: `${titleSegment} | The Dropper`,
        description,
        url: canonical,
        siteName: "The Dropper",
        type: "website",
        images: ogImages,
      },
      twitter: {
        card: deal.image_url ? "summary_large_image" : "summary",
        title: `${titleSegment} | The Dropper`,
        description,
        images: deal.image_url ? [deal.image_url] : undefined,
      },
    };
  } catch {
    return { title: "Deal not found" };
  }
}

export default async function DealPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) notFound();

  const fromRaw =
    typeof sp.from === "string"
      ? sp.from
      : Array.isArray(sp.from)
        ? sp.from[0]
        : undefined;
  const backToDealsHref = sanitizeDealsListBackHref(fromRaw);

  const [deal, priceHistory] = await Promise.all([
    fetchDeal(dealId),
    fetchPriceHistory(dealId),
  ]).catch(() => [null, null]);

  if (!deal) notFound();

  return (
    <>
      <JsonLd data={buildProductJsonLd(deal)} />
      <DealDetailContent
        deal={deal}
        priceHistory={priceHistory ?? undefined}
        backToDealsHref={backToDealsHref}
      />
    </>
  );
}
