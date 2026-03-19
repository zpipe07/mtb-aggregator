import { notFound } from "next/navigation";
import { fetchDeal, fetchPriceHistory } from "@/api";
import { DealDetailContent } from "./DealDetailContent";

export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
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

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) notFound();

  const [deal, priceHistory] = await Promise.all([
    fetchDeal(dealId),
    fetchPriceHistory(dealId),
  ]).catch(() => [null, null]);

  if (!deal) notFound();

  return (
    <DealDetailContent
      deal={deal}
      priceHistory={priceHistory ?? undefined}
    />
  );
}
