import { describe, expect, it } from "vitest";
import { railOverflowState, railScrollStep } from "./railScroll";

describe("railOverflowState", () => {
  it("is at the start when content overflows", () => {
    expect(railOverflowState(0, 400, 1200)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  it("is in the middle when both sides have leftover scroll", () => {
    expect(railOverflowState(200, 400, 1200)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it("is at the end when scrolled to the last page", () => {
    expect(railOverflowState(800, 400, 1200)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });

  it("has no overflow when all content fits", () => {
    expect(railOverflowState(0, 800, 800)).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it("treats subpixel leftover as at the end", () => {
    expect(railOverflowState(799.5, 400, 1200)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });
});

describe("railScrollStep", () => {
  it("scrolls one card plus gap when item width is known", () => {
    expect(railScrollStep(800, 320, 16)).toBe(336);
  });

  it("falls back to 80% of the viewport", () => {
    expect(railScrollStep(500)).toBe(400);
  });

  it("uses a 280px minimum when the viewport is narrow", () => {
    expect(railScrollStep(200)).toBe(280);
  });
});
