import { describe, expect, it } from "vitest";
import {
  PRICE_HISTORY_LABEL_GAP,
  priceHistoryLabelBounds,
  priceHistoryPlotWidth,
  priceHistoryTickAnchor,
  priceHistoryTickX,
  selectPriceHistoryTickIndexes,
} from "./priceHistoryTicks";

function expectLabelsClear(pointCount: number, plotWidth: number) {
  const indexes = selectPriceHistoryTickIndexes(pointCount, plotWidth);
  expect(indexes.length).toBeGreaterThan(0);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  expect(new Set(indexes).size).toBe(indexes.length);
  for (const index of indexes) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(pointCount);
  }

  const boxes = indexes.map((index) =>
    priceHistoryLabelBounds(index, pointCount, plotWidth),
  );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(-0.5);
    expect(box.right).toBeLessThanOrEqual(plotWidth + 0.5);
  }
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.left - boxes[i - 1]!.right).toBeGreaterThanOrEqual(
      PRICE_HISTORY_LABEL_GAP - 0.5,
    );
  }

  if (indexes.length >= 2) {
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(pointCount - 1);
    expect(priceHistoryTickX(0, pointCount, plotWidth)).toBe(0);
    expect(priceHistoryTickX(pointCount - 1, pointCount, plotWidth)).toBe(plotWidth);
    expect(priceHistoryTickAnchor(0, pointCount)).toBe("start");
    expect(priceHistoryTickAnchor(pointCount - 1, pointCount)).toBe("end");
  }
}

describe("selectPriceHistoryTickIndexes", () => {
  it("returns nothing until the chart has been measured", () => {
    expect(selectPriceHistoryTickIndexes(19, 0)).toEqual([]);
    expect(selectPriceHistoryTickIndexes(0, 400)).toEqual([]);
  });

  it("keeps a single point centered", () => {
    expect(selectPriceHistoryTickIndexes(1, 200)).toEqual([0]);
    expect(priceHistoryTickAnchor(0, 1)).toBe("middle");
    expect(priceHistoryTickX(0, 1, 200)).toBe(100);
  });

  it("puts the first and last prices on the plot edges", () => {
    const plot = priceHistoryPlotWidth(652);
    expect(priceHistoryTickX(0, 19, plot)).toBe(0);
    expect(priceHistoryTickX(18, 19, plot)).toBe(plot);
    const indexes = selectPriceHistoryTickIndexes(19, plot);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(18);
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
