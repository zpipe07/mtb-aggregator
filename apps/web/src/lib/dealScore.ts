import type { Deal, PriceHistoryResponse } from "@/api";

export type DealScoreLabel =
  | "steal"
  | "great"
  | "good"
  | "fair"
  | "watch";

export type DealScoreResult = {
  score: number;
  label: DealScoreLabel;
  displayLabel: string;
};

function discountScore(deal: Deal): number {
  const pct =
    deal.discount_pct ??
    (deal.original_price != null &&
    deal.original_price > deal.current_price &&
    deal.original_price > 0
      ? (1 - deal.current_price / deal.original_price) * 100
      : 0);
  if (pct >= 50) return 40;
  if (pct >= 35) return 32;
  if (pct >= 25) return 24;
  if (pct >= 15) return 16;
  if (pct >= 5) return 8;
  return 0;
}

function priceHistoryScore(
  deal: Deal,
  priceHistory?: PriceHistoryResponse | null,
): number {
  if (!priceHistory || priceHistory.points.length < 2) return 0;
  const { lowest_price, highest_price } = priceHistory;
  if (lowest_price <= 0 || highest_price <= lowest_price) return 0;
  const price = deal.current_price;
  if (price <= lowest_price * 1.02) return 35;
  if (price <= lowest_price * 1.08) return 25;
  const range = highest_price - lowest_price;
  const position = (price - lowest_price) / range;
  if (position <= 0.35) return 18;
  if (position <= 0.55) return 10;
  return 0;
}

function labelFromScore(score: number): DealScoreResult {
  if (score >= 70) {
    return { score, label: "steal", displayLabel: "Steal" };
  }
  if (score >= 55) {
    return { score, label: "great", displayLabel: "Great deal" };
  }
  if (score >= 40) {
    return { score, label: "good", displayLabel: "Good deal" };
  }
  if (score >= 25) {
    return { score, label: "fair", displayLabel: "Fair price" };
  }
  return { score, label: "watch", displayLabel: "Watch price" };
}

/** Heuristic deal quality score (0–100) using discount and price history. */
export function computeDealScore(
  deal: Deal,
  priceHistory?: PriceHistoryResponse | null,
): DealScoreResult {
  let score = discountScore(deal) + priceHistoryScore(deal, priceHistory);
  if (deal.is_in_stock) score += 5;
  if (priceHistory?.price_dropped) score += 10;
  score = Math.min(100, Math.max(0, score));
  return labelFromScore(score);
}

/** Short price-position label when history exists. */
export function pricePositionLabel(
  deal: Deal,
  priceHistory?: PriceHistoryResponse | null,
): string | null {
  if (!priceHistory || priceHistory.points.length < 2) return null;
  const { lowest_price } = priceHistory;
  if (deal.current_price <= lowest_price * 1.02) return "At historical low";
  if (deal.current_price <= lowest_price * 1.08) return "Near historical low";
  if (priceHistory.price_dropped) return "Price dropped";
  return null;
}
