import { describe, it, expect } from "vitest";
import {
  HUB_BRAND_NO_MATCH,
  buildFetchDealsParamsFromHubAndFilters,
  buildFetchFacetsParamsFromHubAndFilters,
  emptyParsedFilterParams,
  getSeoHubBySlug,
  resolveHubDealBrands,
  resolveHubSearchQuery,
  scopeBrandFacetsToHubTheme,
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

describe("mountain-bikes-under-3000 hub", () => {
  it("scopes deals and facets to bikes-mountain with a $3000 cap", () => {
    const hub = getSeoHubBySlug("mountain-bikes-under-3000");
    expect(hub).toBeDefined();
    expect(hub!.filters.category_slug).toBe("bikes-mountain");
    expect(hub!.filters.max_price).toBe(3000);

    const fp = emptyParsedFilterParams();
    const deals = buildFetchDealsParamsFromHubAndFilters(hub!, fp);
    const facets = buildFetchFacetsParamsFromHubAndFilters(hub!, fp);
    expect(deals.category_slug).toBe("bikes-mountain");
    expect(deals.max_price).toBe(3000);
    expect(facets.category_slug).toBe("bikes-mountain");
    expect(facets.max_price).toBe(3000);
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

describe("resolveHubDealBrands (ZAC-282)", () => {
  it("keeps hub theme brands when the URL has no brand filter", () => {
    expect(resolveHubDealBrands(["Fox"], [])).toEqual(["Fox"]);
  });

  it("intersects URL brands with the hub theme instead of unioning", () => {
    expect(resolveHubDealBrands(["Fox"], ["RockShox"])).toEqual([
      HUB_BRAND_NO_MATCH,
    ]);
    expect(resolveHubDealBrands(["Fox"], ["Fox"])).toEqual(["Fox"]);
    expect(resolveHubDealBrands(["Fox"], ["fox"])).toEqual(["Fox"]);
  });

  it("applies URL brands as-is when the hub has no theme brands", () => {
    expect(resolveHubDealBrands(undefined, ["RockShox"])).toEqual([
      "RockShox",
    ]);
    expect(resolveHubDealBrands([], ["RockShox"])).toEqual(["RockShox"]);
  });
});

describe("scopeBrandFacetsToHubTheme (ZAC-282)", () => {
  const forksBrands = [
    { value: "Fox", count: 22 },
    { value: "RockShox", count: 92 },
    { value: "Marzocchi", count: 4 },
  ];

  it("drops brands that are not in a brand-themed hub result set", () => {
    expect(scopeBrandFacetsToHubTheme(forksBrands, ["Fox"])).toEqual([
      { value: "Fox", count: 22 },
    ]);
  });

  it("leaves facets unchanged when the hub is not brand-themed", () => {
    expect(scopeBrandFacetsToHubTheme(forksBrands, undefined)).toEqual(
      forksBrands,
    );
  });
});

describe("fox-forks hub brand filter (ZAC-282)", () => {
  it("does not OR an off-theme Brand filter into deals or facets", () => {
    const hub = getSeoHubBySlug("fox-forks");
    expect(hub).toBeDefined();
    expect(hub!.filters.brands).toEqual(["Fox"]);

    const fp = { ...emptyParsedFilterParams(), brandFilters: ["RockShox"] };
    const deals = buildFetchDealsParamsFromHubAndFilters(hub!, fp);
    const facets = buildFetchFacetsParamsFromHubAndFilters(hub!, fp);

    expect(deals.brands).toEqual([HUB_BRAND_NO_MATCH]);
    expect(deals.brand_scope).toEqual(["Fox"]);
    expect(deals.brands).not.toContain("RockShox");
    expect(deals.brands).not.toEqual(["Fox", "RockShox"]);
    expect(facets.brands).toEqual([HUB_BRAND_NO_MATCH]);
    expect(facets.brand_scope).toEqual(["Fox"]);
    expect(facets.category_slug).toBe("components-suspension-forks");
  });

  it("keeps Fox when the URL brand is already on-theme", () => {
    const hub = getSeoHubBySlug("fox-forks")!;
    const fp = { ...emptyParsedFilterParams(), brandFilters: ["Fox"] };
    const deals = buildFetchDealsParamsFromHubAndFilters(hub, fp);
    expect(deals.brands).toEqual(["Fox"]);
    expect(deals.brand_scope).toEqual(["Fox"]);
  });

  it("locks the hub brand when the URL has no brand filter", () => {
    const hub = getSeoHubBySlug("fox-forks")!;
    const deals = buildFetchDealsParamsFromHubAndFilters(
      hub,
      emptyParsedFilterParams(),
    );
    const facets = buildFetchFacetsParamsFromHubAndFilters(
      hub,
      emptyParsedFilterParams(),
    );
    expect(deals.brands).toEqual(["Fox"]);
    expect(deals.brand_scope).toEqual(["Fox"]);
    expect(facets.brand_scope).toEqual(["Fox"]);
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
