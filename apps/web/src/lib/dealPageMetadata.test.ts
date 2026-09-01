import { describe, it, expect } from "vitest";
import {
  buildDealDetailMetadata,
  buildDealPriceHistoryMetadata,
  dealDetailPath,
  missingDealMetadata,
  stripDealDetailFromQuery,
} from "./dealPageMetadata";

const deal = {
  id: 136029,
  product_name: "SRAM Code RSC",
  brand: "SRAM",
  current_price: 199,
  original_price: 299,
  discount_pct: 33.4,
  store_name: "Worldwide Cyclery",
  image_url: "https://cdn.example/code.jpg",
};

describe("buildDealDetailMetadata", () => {
  it("emits index, follow and a query-free canonical", () => {
    const meta = buildDealDetailMetadata(deal);
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/deals/136029");
    expect(dealDetailPath(deal.id)).toBe("/deals/136029");
    expect(meta.openGraph?.url).toMatch(/\/deals\/136029$/);
    expect(String(meta.openGraph?.url)).not.toContain("?");
    expect(String(meta.alternates?.canonical)).not.toContain("?");
  });

  it("does not put tracking params on the canonical (helper never sees search)", () => {
    const fromUrl = "https://thedropper.shop/deals/136029?from=/deals/c/components";
    const stripped = stripDealDetailFromQuery(new URL(fromUrl));
    expect(stripped?.pathname).toBe("/deals/136029");
    expect(stripped?.search).toBe("");
    const meta = buildDealDetailMetadata(deal);
    expect(meta.alternates?.canonical).toBe("/deals/136029");
  });
});

describe("buildDealPriceHistoryMetadata", () => {
  it("is always noindex, even when history copy is present", () => {
    const meta = buildDealPriceHistoryMetadata(deal, {
      descriptionSuffix: " — at the historical low",
    });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("/deals/136029/price-history");
  });
});

describe("missingDealMetadata", () => {
  it("noindexes the empty deal-not-found document", () => {
    expect(missingDealMetadata.robots).toEqual({ index: false, follow: true });
    expect(missingDealMetadata.alternates?.canonical).toBeUndefined();
  });
});

describe("stripDealDetailFromQuery", () => {
  it("308 target is the clean deal URL when from= is present", () => {
    const next = stripDealDetailFromQuery(
      new URL("https://thedropper.shop/deals/421507?from=/deals/c/components"),
    );
    expect(next?.toString()).toBe("https://thedropper.shop/deals/421507");
  });

  it("preserves unrelated query params after stripping from=", () => {
    const next = stripDealDetailFromQuery(
      new URL("https://thedropper.shop/deals/42?from=/deals&utm_source=gsc"),
    );
    expect(next?.searchParams.get("from")).toBeNull();
    expect(next?.searchParams.get("utm_source")).toBe("gsc");
  });

  it("does not touch hubs, categories, brands, or price-history", () => {
    const urls = [
      "https://thedropper.shop/deals/c/components?from=/deals",
      "https://thedropper.shop/deals/hub/fox-forks?from=/deals",
      "https://thedropper.shop/deals/brand/sram?from=/deals",
      "https://thedropper.shop/deals/42/price-history?from=/deals",
      "https://thedropper.shop/deals/42",
    ];
    for (const href of urls) {
      expect(stripDealDetailFromQuery(new URL(href))).toBeNull();
    }
  });
});
