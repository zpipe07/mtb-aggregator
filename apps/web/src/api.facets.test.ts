import { describe, it, expect } from "vitest";
import { normalizeFacetsResponse } from "./api";

describe("normalizeFacetsResponse", () => {
  it("coerces null brand_facets from API JSON to empty array", () => {
    const facets = normalizeFacetsResponse({
      spec_facets: [],
      brand_facets: null as unknown as [],
      price_range: { min: 10, max: 100 },
      total_matching: 3,
    });
    expect(facets.brand_facets).toEqual([]);
    expect(facets.spec_facets).toEqual([]);
    expect(facets.price_range).toEqual({ min: 10, max: 100 });
    expect(facets.total_matching).toBe(3);
  });

  it("prefers brand facet override when provided", () => {
    const facets = normalizeFacetsResponse(
      {
        spec_facets: [],
        brand_facets: null as unknown as [],
        price_range: { min: 0, max: 0 },
        total_matching: 0,
      },
      [{ value: "SRAM", count: 5 }],
    );
    expect(facets.brand_facets).toEqual([{ value: "SRAM", count: 5 }]);
  });

  it("returns empty facets when response is null", () => {
    const facets = normalizeFacetsResponse(null);
    expect(facets).toEqual({
      spec_facets: [],
      brand_facets: [],
      price_range: { min: 0, max: 0 },
      total_matching: 0,
    });
  });
});
