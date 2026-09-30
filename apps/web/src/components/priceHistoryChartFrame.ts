/**
 * Outer frame shared by {@link PriceHistoryChart} and its lazy-load skeleton so
 * the placeholder reserves the same box and the page does not shift when
 * recharts arrives. Keep this module free of recharts imports.
 */
export const PRICE_HISTORY_CHART_FRAME_CLASS =
  "h-64 w-full rounded-sm border border-foreground/40 bg-card/50 p-2";
