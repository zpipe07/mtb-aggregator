/**
 * X-axis layout for the PDP price chart.
 *
 * Recharts sizes ticks with the default UI font, not `var(--font-mono)`.
 * Geist Mono "Mmm dd" labels are about 40px at 11px, so the built-in 5px
 * gap lets neighbors collide ("Aug 13Aug 16") and the last label clips the
 * SVG edge. These constants match that measured width, with a little slack.
 */
export const PRICE_HISTORY_LABEL_WIDTH = 44;
export const PRICE_HISTORY_LABEL_GAP = 16;
export const PRICE_HISTORY_EDGE_PADDING = 28;
export const PRICE_HISTORY_Y_AXIS_WIDTH = 60;
export const PRICE_HISTORY_CHART_MARGIN = {
  top: 8,
  right: 8,
  left: 0,
  bottom: 4,
} as const;

const TICK_SLOT = PRICE_HISTORY_LABEL_WIDTH + PRICE_HISTORY_LABEL_GAP;

export function priceHistoryPlotWidth(chartWidth: number): number {
  if (!Number.isFinite(chartWidth) || chartWidth <= 0) return 0;
  return Math.max(
    0,
    chartWidth -
      PRICE_HISTORY_Y_AXIS_WIDTH -
      PRICE_HISTORY_CHART_MARGIN.left -
      PRICE_HISTORY_CHART_MARGIN.right,
  );
}

function evenlySpacedIndexes(pointCount: number, tickCount: number): number[] {
  if (tickCount >= pointCount) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }
  const last = pointCount - 1;
  const gaps = tickCount - 1;
  const chosen = new Set<number>([0, last]);
  for (let step = 1; step < gaps; step++) {
    chosen.add(Math.round((step * last) / gaps));
  }
  return [...chosen].sort((a, b) => a - b);
}

function ticksFit(indexes: readonly number[], pointCount: number, usable: number): boolean {
  const last = pointCount - 1;
  if (last <= 0) return true;
  for (let i = 1; i < indexes.length; i++) {
    const px = ((indexes[i]! - indexes[i - 1]!) / last) * usable;
    if (px + 0.01 < TICK_SLOT) return false;
  }
  return true;
}

/**
 * Data indexes whose date labels can sit on the category axis without
 * overlapping or crossing the plot edge. Always keeps the first and last
 * point when both fit, so the range of the series stays readable.
 */
export function selectPriceHistoryTickIndexes(
  pointCount: number,
  plotWidth: number,
): number[] {
  if (pointCount <= 0 || !Number.isFinite(plotWidth) || plotWidth <= 0) return [];
  if (pointCount === 1) return [0];

  const usable = plotWidth - PRICE_HISTORY_EDGE_PADDING * 2;
  if (usable < TICK_SLOT) return [pointCount - 1];

  const maxTicks = Math.min(pointCount, Math.floor(usable / TICK_SLOT) + 1);
  let tickCount = Math.max(2, maxTicks);
  let indexes = evenlySpacedIndexes(pointCount, tickCount);
  while (tickCount > 2 && !ticksFit(indexes, pointCount, usable)) {
    tickCount -= 1;
    indexes = evenlySpacedIndexes(pointCount, tickCount);
  }
  return indexes;
}
