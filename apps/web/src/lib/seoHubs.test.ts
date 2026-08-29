import { describe, it, expect } from "vitest";
import {
  buildFetchDealsParamsFromHubAndFilters,
  emptyParsedFilterParams,
  getSeoHubBySlug,
  resolveHubSearchQuery,
} from "./seoHubs";

describe("resolveHubSearchQuery", () => {
  it("uses hub default q when URL search is empty", () => {
    const q = resolveHubSearchQuery(
      { category_slug: "components-wheels-tires-tires", q: "radial" },
      emptyParsedFilterParams(),
    );
    expect(q).toBe("radial");
  });

  it("prefers URL q over hub default", () => {
    const fp = { ...emptyParsedFilterParams(), searchQuery: "schwalbe" };
    const q = resolveHubSearchQuery(
      { category_slug: "components-wheels-tires-tires", q: "radial" },
      fp,
    );
    expect(q).toBe("schwalbe");
  });

  it("returns undefined when neither hub nor URL has q", () => {
    const q = resolveHubSearchQuery(
      { category_slug: "components" },
      emptyParsedFilterParams(),
    );
    expect(q).toBeUndefined();
  });
});

describe("radial-tires hub", () => {
  it("is registered with category + default search", () => {
    const hub = getSeoHubBySlug("radial-tires");
    expect(hub).toBeDefined();
    expect(hub!.filters.category_slug).toBe("components-wheels-tires-tires");
    expect(hub!.filters.q).toBe("radial");
  });

  it("builds deals params with default q", () => {
    const hub = getSeoHubBySlug("radial-tires")!;
    const params = buildFetchDealsParamsFromHubAndFilters(
      hub,
      emptyParsedFilterParams(),
    );
    expect(params.category_slug).toBe("components-wheels-tires-tires");
    expect(params.q).toBe("radial");
  });
});

describe("emtbs-under-5000 hub", () => {
  it("is registered with eMTB category and $5,000 price cap", () => {
    const hub = getSeoHubBySlug("emtbs-under-5000");
    expect(hub).toBeDefined();
    expect(hub!.title).toBe("eMTBs on sale under $5,000");
    expect(hub!.filters.category_slug).toBe("bikes-emtb");
    expect(hub!.filters.max_price).toBe(5000);
    expect(hub!.parentCategoryPath).toBe("/deals/c/bikes/emtb");
    expect(hub!.relatedCategorySlugs).toContain("bikes-emtb");
    expect(hub!.faq?.length).toBeGreaterThan(0);
  });

  it("builds deals params with category and max_price", () => {
    const hub = getSeoHubBySlug("emtbs-under-5000")!;
    const params = buildFetchDealsParamsFromHubAndFilters(
      hub,
      emptyParsedFilterParams(),
    );
    expect(params.category_slug).toBe("bikes-emtb");
    expect(params.max_price).toBe(5000);
    expect(params.q).toBeUndefined();
  });
});
