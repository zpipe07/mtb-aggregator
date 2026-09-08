import { describe, it, expect } from "vitest";
import {
  parseFilterParamsFromURL,
  parseFilterParamsFromSearch,
  parsePriceParam,
  normalizeFilterQueryString,
  resolveUiCategorySlug,
} from "./filterParams";

describe("parseFilterParamsFromURL", () => {
  it("collects repeated brand and spec params (OR within key)", () => {
    const u = new URLSearchParams();
    u.append("brand", "SRAM");
    u.append("brand", "Shimano");
    u.append("spec_tire_width", '2.3"');
    u.append("spec_tire_width", '2.4"');
    const p = parseFilterParamsFromURL(u);
    expect(p.brandFilters).toEqual(["SRAM", "Shimano"]);
    expect(p.specFilters.tire_width).toEqual(['2.3"', '2.4"']);
  });

  it("dedupes repeated values", () => {
    const u = new URLSearchParams();
    u.append("brand", "SRAM");
    u.append("brand", "SRAM");
    const p = parseFilterParamsFromURL(u);
    expect(p.brandFilters).toEqual(["SRAM"]);
  });
});

describe("parseFilterParamsFromSearch", () => {
  it("defaults sort to value when sort param is absent", () => {
    const p = parseFilterParamsFromSearch({});
    expect(p.sort).toBe("value");
  });

  it("handles Next.js string | string[] record", () => {
    const p = parseFilterParamsFromSearch({
      brand: ["SRAM", "Shimano"],
      "spec_wheel_size": ["29", "27.5"],
    });
    expect(p.brandFilters).toEqual(["SRAM", "Shimano"]);
    expect(p.specFilters.wheel_size).toEqual(["29", "27.5"]);
  });
});

describe("parsePriceParam", () => {
  it("returns undefined for empty or invalid values", () => {
    expect(parsePriceParam("")).toBeUndefined();
    expect(parsePriceParam("abc")).toBeUndefined();
    expect(parsePriceParam("0")).toBeUndefined();
  });

  it("returns positive numbers", () => {
    expect(parsePriceParam("50")).toBe(50);
    expect(parsePriceParam(" 99.5 ")).toBe(99.5);
  });
});

describe("resolveUiCategorySlug", () => {
  it("uses the route-locked slug when the URL has no category (SEO hubs)", () => {
    expect(resolveUiCategorySlug("", "bikes-mountain")).toBe("bikes-mountain");
  });

  it("prefers the route-locked slug over a query/path category", () => {
    expect(resolveUiCategorySlug("components", "bikes-mountain")).toBe(
      "bikes-mountain",
    );
  });

  it("falls back to path/query category when no route lock is set", () => {
    expect(resolveUiCategorySlug("bikes-mountain")).toBe("bikes-mountain");
    expect(resolveUiCategorySlug(" bikes-mountain ")).toBe("bikes-mountain");
  });

  it("returns empty when neither route nor URL has a category", () => {
    expect(resolveUiCategorySlug("")).toBe("");
    expect(resolveUiCategorySlug("", "  ")).toBe("");
  });
});

describe("normalizeFilterQueryString", () => {
  it("sorts keys and repeated values for stable comparison", () => {
    const a = "brand=Z&brand=A&q=test&spec_x=2&spec_x=1";
    const b = "q=test&spec_x=1&spec_x=2&brand=A&brand=Z";
    expect(normalizeFilterQueryString(a)).toEqual(normalizeFilterQueryString(b));
  });
});
