import { describe, it, expect } from "vitest";
import { formatCount, stepDueCount } from "./insightsMetrics";

describe("stepDueCount", () => {
  it("prefers due when both due and backlog are present", () => {
    expect(stepDueCount({ due: 12, backlog: 99 })).toBe(12);
  });

  it("falls back to backlog for pre-rename API payloads (MTB-AGGREGATOR-WEB-J)", () => {
    expect(stepDueCount({ backlog: 7 })).toBe(7);
  });

  it("returns undefined when neither due nor backlog is a number", () => {
    expect(stepDueCount({})).toBeUndefined();
    expect(stepDueCount({ due: undefined, backlog: undefined })).toBeUndefined();
  });
});

describe("formatCount", () => {
  it("formats integers with locale grouping", () => {
    expect(formatCount(1234)).toBe((1234).toLocaleString());
  });

  it("renders an em dash instead of calling toLocaleString on missing values", () => {
    expect(formatCount(undefined)).toBe("—");
    expect(formatCount(null)).toBe("—");
  });

  it("formats zero (a real gauge) rather than treating it as missing", () => {
    expect(formatCount(0)).toBe("0");
  });
});
