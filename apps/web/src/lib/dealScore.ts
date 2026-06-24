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

/** Minimal price history for scoring (full chart or list summary). */
export type PriceHistoryForScoring = Pick<
  PriceHistoryResponse,
  "lowest_price" | "highest_price" | "price_dropped"
> & {
  point_count?: number;
  points?: PriceHistoryResponse["points"];
};

function hasEnoughHistory(
  priceHistory?: PriceHistoryForScoring | null,
): boolean {
  if (!priceHistory) return false;
  if ((priceHistory.points?.length ?? 0) >= 2) return true;
  return (priceHistory.point_count ?? 0) >= 2;
}

/** Prefer full history on detail pages; fall back to list summary from the API. */
export function resolvePriceHistoryForScoring(
  deal: Deal,
  priceHistory?: PriceHistoryResponse | null,
): PriceHistoryForScoring | null {
  if (priceHistory && priceHistory.points.length >= 2) {
    return priceHistory;
  }
  const summary = deal.price_history_summary;
  if (summary && summary.point_count >= 2) {
    return {
      lowest_price: summary.lowest_price,
      highest_price: summary.highest_price,
      price_dropped: summary.price_dropped,
      point_count: summary.point_count,
    };
  }
  return null;
}

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
  priceHistory?: PriceHistoryForScoring | null,
): number {
  if (!hasEnoughHistory(priceHistory)) return 0;
  const { lowest_price, highest_price } = priceHistory!;
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
  const history = resolvePriceHistoryForScoring(deal, priceHistory);
  let score = discountScore(deal) + priceHistoryScore(deal, history);
  if (deal.is_in_stock) score += 5;
  if (history?.price_dropped) score += 10;
  score = Math.min(100, Math.max(0, score));
  return labelFromScore(score);
}

/** Short price-position label when history exists. */
export function pricePositionLabel(
  deal: Deal,
  priceHistory?: PriceHistoryResponse | null,
): string | null {
  const history = resolvePriceHistoryForScoring(deal, priceHistory);
  if (!hasEnoughHistory(history)) return null;
  const { lowest_price } = history!;
  if (deal.current_price <= lowest_price * 1.02) return "At historical low";
  if (deal.current_price <= lowest_price * 1.08) return "Near historical low";
  if (history!.price_dropped) return "Price dropped";
  return null;
}
