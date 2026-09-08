import { describe, expect, it } from "vitest";
import {
  DEFAULT_JENSON_MAX_PAGES,
  buildJensonNextPageUrl,
  isJensonScrapeTruncated,
  jensonMaxPages,
  jensonEmptyPageAfterFullPage,
  jensonScrapeTruncated,
  jensonShouldFetchNextPage,
  markJensonScrapeTruncated,
} from "./jensonusa-pagination.js";

describe("jensonMaxPages", () => {
  it("defaults to 50 so SCRAPER_MAX_PAGES=10 cannot truncate /sale", () => {
    expect(jensonMaxPages({ SCRAPER_MAX_PAGES: "10" })).toBe(
      DEFAULT_JENSON_MAX_PAGES,
    );
    expect(jensonMaxPages({})).toBe(DEFAULT_JENSON_MAX_PAGES);
  });

  it("honors JENSON_MAX_PAGES even when below the floor", () => {
    expect(
      jensonMaxPages({ JENSON_MAX_PAGES: "8", SCRAPER_MAX_PAGES: "10" }),
    ).toBe(8);
  });

  it("uses SCRAPER_MAX_PAGES when it is already at or above the floor", () => {
    expect(jensonMaxPages({ SCRAPER_MAX_PAGES: "80" })).toBe(80);
  });
});

describe("buildJensonNextPageUrl", () => {
  it("increments pn on /sale", () => {
    expect(buildJensonNextPageUrl("https://www.jensonusa.com/sale?ps=100")).toBe(
      "https://www.jensonusa.com/sale?ps=100&pn=1",
    );
    expect(
      buildJensonNextPageUrl("https://www.jensonusa.com/sale?ps=100&pn=9"),
    ).toBe("https://www.jensonusa.com/sale?ps=100&pn=10");
  });

  it("returns null off /sale", () => {
    expect(
      buildJensonNextPageUrl("https://www.jensonusa.com/fox-40-factory"),
    ).toBeNull();
  });
});

describe("jenson pagination stop", () => {
  it("continues while the page is full and under the cap", () => {
    expect(
      jensonShouldFetchNextPage({
        pageNum: 10,
        maxPages: 50,
        lastPageListingCount: 233,
        nextUrl: "https://www.jensonusa.com/sale?ps=100&pn=10",
      }),
    ).toBe(true);
  });

  it("treats a full last cap page with a next URL as truncated (ZAC-217 Fox 40)", () => {
    const args = {
      pageNum: 10,
      maxPages: 10,
      lastPageListingCount: 233,
      nextUrl: "https://www.jensonusa.com/sale?ps=100&pn=10",
    };
    expect(jensonShouldFetchNextPage(args)).toBe(false);
    expect(jensonScrapeTruncated(args)).toBe(true);
  });

  it("is complete when the last page is a remainder", () => {
    const args = {
      pageNum: 12,
      maxPages: 50,
      lastPageListingCount: 20,
      nextUrl: "https://www.jensonusa.com/sale?ps=100&pn=12",
    };
    expect(jensonShouldFetchNextPage(args)).toBe(false);
    expect(jensonScrapeTruncated(args)).toBe(false);
  });

  it("treats an empty page after a full page as truncated (ZAC-270)", () => {
    expect(
      jensonEmptyPageAfterFullPage({
        currentPageListingCount: 0,
        previousPageListingCount: 149,
      }),
    ).toBe(true);
    expect(
      jensonEmptyPageAfterFullPage({
        currentPageListingCount: 0,
        previousPageListingCount: 0,
      }),
    ).toBe(false);
    expect(
      jensonEmptyPageAfterFullPage({
        currentPageListingCount: 20,
        previousPageListingCount: 149,
      }),
    ).toBe(false);
  });
});

describe("truncated stamp", () => {
  it("is readable by the scrape route without appearing in JSON", () => {
    const rows = [{ store_sku: "FK001472 BLK 203MM" }];
    expect(isJensonScrapeTruncated(rows)).toBe(false);
    markJensonScrapeTruncated(rows);
    expect(isJensonScrapeTruncated(rows)).toBe(true);
    expect(JSON.stringify(rows)).toBe(
      JSON.stringify([{ store_sku: "FK001472 BLK 203MM" }]),
    );
  });
});
