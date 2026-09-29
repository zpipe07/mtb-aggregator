/**
 * X-axis layout for the PDP price chart.
 *
 * Recharts sizes ticks with the default UI font, not `var(--font-mono)`.
 * Geist Mono "Mmm dd" labels are about 40px at 11px, so the built-in 5px
 * gap lets neighbors collide ("Aug 13Aug 16") and a centered last label
 * clips the SVG edge. These constants match that measured width, with a
 * little slack.
 *
 * The series itself is not inset. The first date is start-aligned and the
 * last date is end-aligned, so both stay inside the frame while the line
 * meets the left and right edges of the plot.
 */
export const PRICE_HISTORY_LABEL_WIDTH = 44;
export const PRICE_HISTORY_LABEL_GAP = 16;
export const PRICE_HISTORY_Y_AXIS_WIDTH = 60;
export const PRICE_HISTORY_CHART_MARGIN = {
  top: 8,
  right: 0,
  left: 0,
  bottom: 4,
} as const;

const TICK_SLOT = PRICE_HISTORY_LABEL_WIDTH + PRICE_HISTORY_LABEL_GAP;

export type PriceHistoryTickAnchor = "start" | "middle" | "end";

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

/** Horizontal position of a category point. The series spans the plot. */
export function priceHistoryTickX(
  index: number,
  pointCount: number,
  plotWidth: number,
): number {
  if (pointCount <= 1) return plotWidth / 2;
  return (index / (pointCount - 1)) * plotWidth;
}

export function priceHistoryTickAnchor(
  index: number,
  pointCount: number,
): PriceHistoryTickAnchor {
  if (pointCount <= 1) return "middle";
  if (index <= 0) return "start";
  if (index >= pointCount - 1) return "end";
  return "middle";
}

export function priceHistoryLabelBounds(
  index: number,
  pointCount: number,
  plotWidth: number,
): { left: number; right: number } {
  const x = priceHistoryTickX(index, pointCount, plotWidth);
  const anchor = priceHistoryTickAnchor(index, pointCount);
  if (anchor === "start") {
    return { left: x, right: x + PRICE_HISTORY_LABEL_WIDTH };
  }
  if (anchor === "end") {
    return { left: x - PRICE_HISTORY_LABEL_WIDTH, right: x };
  }
  return {
    left: x - PRICE_HISTORY_LABEL_WIDTH / 2,
    right: x + PRICE_HISTORY_LABEL_WIDTH / 2,
  };
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

function ticksFit(
  indexes: readonly number[],
  pointCount: number,
  plotWidth: number,
): boolean {
  const boxes = indexes.map((index) =>
    priceHistoryLabelBounds(index, pointCount, plotWidth),
  );
  for (const box of boxes) {
    if (box.left < -0.5 || box.right > plotWidth + 0.5) return false;
  }
  for (let i = 1; i < boxes.length; i++) {
    const gap = boxes[i]!.left - boxes[i - 1]!.right;
    if (gap + 0.01 < PRICE_HISTORY_LABEL_GAP) return false;
  }
  return true;
}

/**
 * Data indexes whose date labels can sit on the category axis without
 * overlapping or leaving the plot. Always keeps the first and last point
 * when both fit, so the range of the series stays readable.
 */
export function selectPriceHistoryTickIndexes(
  pointCount: number,
  plotWidth: number,
): number[] {
  if (pointCount <= 0 || !Number.isFinite(plotWidth) || plotWidth <= 0) return [];
  if (pointCount === 1) return [0];

  const last = pointCount - 1;
  const maxTicks = Math.min(
    pointCount,
    Math.floor((plotWidth + PRICE_HISTORY_LABEL_GAP) / TICK_SLOT),
  );
  if (maxTicks < 2 || !ticksFit([0, last], pointCount, plotWidth)) {
    if (ticksFit([last], pointCount, plotWidth)) return [last];
    if (ticksFit([0], pointCount, plotWidth)) return [0];
    return [last];
  }

  let tickCount = maxTicks;
  let indexes = evenlySpacedIndexes(pointCount, tickCount);
  while (tickCount > 2 && !ticksFit(indexes, pointCount, plotWidth)) {
    tickCount -= 1;
    indexes = evenlySpacedIndexes(pointCount, tickCount);
  }
  return indexes;
}
