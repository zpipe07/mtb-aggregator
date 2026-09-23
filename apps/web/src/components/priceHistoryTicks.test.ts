import { describe, expect, it } from "vitest";
import {
  PRICE_HISTORY_EDGE_PADDING,
  PRICE_HISTORY_LABEL_GAP,
  PRICE_HISTORY_LABEL_WIDTH,
  priceHistoryPlotWidth,
  selectPriceHistoryTickIndexes,
} from "./priceHistoryTicks";

const SLOT = PRICE_HISTORY_LABEL_WIDTH + PRICE_HISTORY_LABEL_GAP;

function centers(pointCount: number, plotWidth: number, indexes: readonly number[]) {
  const last = pointCount - 1;
  const span = plotWidth - PRICE_HISTORY_EDGE_PADDING * 2;
  return indexes.map((index) => PRICE_HISTORY_EDGE_PADDING + (index / last) * span);
}

function expectLabelsClear(pointCount: number, plotWidth: number) {
  const indexes = selectPriceHistoryTickIndexes(pointCount, plotWidth);
  expect(indexes.length).toBeGreaterThan(0);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  expect(new Set(indexes).size).toBe(indexes.length);
  for (const index of indexes) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(pointCount);
  }

  if (indexes.length === 1) {
    const [center] = centers(pointCount, plotWidth, indexes);
    expect(center! - PRICE_HISTORY_LABEL_WIDTH / 2).toBeGreaterThanOrEqual(-0.5);
    expect(center! + PRICE_HISTORY_LABEL_WIDTH / 2).toBeLessThanOrEqual(plotWidth + 0.5);
    return;
  }

  expect(indexes[0]).toBe(0);
  expect(indexes[indexes.length - 1]).toBe(pointCount - 1);
  const xs = centers(pointCount, plotWidth, indexes);
  expect(xs[0]! - PRICE_HISTORY_LABEL_WIDTH / 2).toBeGreaterThanOrEqual(-0.5);
  expect(xs[xs.length - 1]! + PRICE_HISTORY_LABEL_WIDTH / 2).toBeLessThanOrEqual(
    plotWidth + 0.5,
  );
  for (let i = 1; i < xs.length; i++) {
    expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(SLOT - 0.5);
  }
}

describe("selectPriceHistoryTickIndexes", () => {
  it("returns nothing until the chart has been measured", () => {
    expect(selectPriceHistoryTickIndexes(19, 0)).toEqual([]);
    expect(selectPriceHistoryTickIndexes(0, 400)).toEqual([]);
  });

  it("keeps a single point", () => {
    expect(selectPriceHistoryTickIndexes(1, 200)).toEqual([0]);
  });

  it("spaces the live PDP series on a phone and on the deal column", () => {
    const mobile = selectPriceHistoryTickIndexes(19, priceHistoryPlotWidth(298));
    const desktop = selectPriceHistoryTickIndexes(19, priceHistoryPlotWidth(652));
    expect(mobile.length).toBeLessThan(desktop.length);
    expect(mobile.length).toBeLessThan(8);
    expectLabelsClear(19, priceHistoryPlotWidth(298));
    expectLabelsClear(19, priceHistoryPlotWidth(652));
  });

  it("keeps labels apart across chart sizes and series lengths", () => {
    for (const count of [2, 3, 5, 10, 19, 40, 90]) {
      for (const chartWidth of [280, 320, 390, 652, 800, 1100]) {
        expectLabelsClear(count, priceHistoryPlotWidth(chartWidth));
      }
    }
  });
});
