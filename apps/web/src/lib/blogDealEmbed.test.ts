import { describe, expect, it } from "vitest";
import {
  formatDealEmbedCap,
  parseDealEmbedMaxPrice,
  parseDealEmbedSort,
  withDealEmbedQuery,
} from "./blogDealEmbed";

describe("parseDealEmbedMaxPrice", () => {
  it("accepts numbers and numeric strings", () => {
    expect(parseDealEmbedMaxPrice(150)).toBe(150);
    expect(parseDealEmbedMaxPrice("2000")).toBe(2000);
    expect(parseDealEmbedMaxPrice(" 80 ")).toBe(80);
  });

  it("rejects junk", () => {
    expect(parseDealEmbedMaxPrice(0)).toBeUndefined();
    expect(parseDealEmbedMaxPrice(-10)).toBeUndefined();
    expect(parseDealEmbedMaxPrice("nope")).toBeUndefined();
    expect(parseDealEmbedMaxPrice(undefined)).toBeUndefined();
  });
});

describe("parseDealEmbedSort", () => {
  it("accepts known sorts", () => {
    expect(parseDealEmbedSort("price_asc")).toBe("price_asc");
    expect(parseDealEmbedSort("value")).toBe("value");
  });

  it("rejects unknown values", () => {
    expect(parseDealEmbedSort("cheap")).toBeUndefined();
    expect(parseDealEmbedSort(1)).toBeUndefined();
  });
});

describe("withDealEmbedQuery", () => {
  it("appends filters to a category path", () => {
    expect(
      withDealEmbedQuery("/deals/c/bikes/mountain", {
        sort: "price_asc",
        maxPrice: 2000,
      }),
    ).toBe("/deals/c/bikes/mountain?sort=price_asc&max_price=2000");
  });

  it("merges onto an existing query without dropping q", () => {
    expect(
      withDealEmbedQuery("/deals?q=dropper", {
        sort: "price_asc",
        maxPrice: 200,
        q: "dropper",
      }),
    ).toBe("/deals?q=dropper&sort=price_asc&max_price=200");
  });

  it("falls back to /deals when href is empty", () => {
    expect(withDealEmbedQuery("  ", { sort: "price_asc" })).toBe("/deals");
  });
});

describe("formatDealEmbedCap", () => {
  it("formats whole dollars", () => {
    expect(formatDealEmbedCap(2000)).toBe("$2,000");
    expect(formatDealEmbedCap(80)).toBe("$80");
  });
});
