import { describe, it, expect } from "vitest";
import {
  buildFetchDealsParamsFromHubAndFilters,
  buildFetchFacetsParamsFromHubAndFilters,
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
