import { notFound } from "next/navigation";
import { fetchDeal, fetchPriceHistory } from "@/api";
import { sanitizeDealsListBackHref } from "@/lib/dealsBackHref";
import { DealDetailContent } from "./DealDetailContent";

export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return { title: "Deal not found" };
  try {
    const deal = await fetchDeal(dealId);
    return {
      title: `${deal.product_name}${deal.brand ? ` | ${deal.brand}` : ""}`,
      description: `$${deal.current_price.toFixed(2)} at ${deal.store_name}${deal.discount_pct ? ` — ${Math.round(deal.discount_pct)}% off` : ""}`,
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
    <DealDetailContent
      deal={deal}
      priceHistory={priceHistory ?? undefined}
      backToDealsHref={backToDealsHref}
    />
  );
}
