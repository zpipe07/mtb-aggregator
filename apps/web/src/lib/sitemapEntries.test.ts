import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalSitemapUrl,
  dealDetailSitemapEntries,
  isIndexableSitemapDealId,
  MAX_DEAL_URLS_IN_SITEMAP,
} from "./sitemapEntries";

describe("isIndexableSitemapDealId", () => {
  it("accepts live listing IDs and rejects missing placeholders", () => {
    expect(isIndexableSitemapDealId(136029)).toBe(true);
    expect(isIndexableSitemapDealId(0)).toBe(false);
    expect(isIndexableSitemapDealId(-12)).toBe(false);
    expect(isIndexableSitemapDealId(1.5)).toBe(false);
    expect(isIndexableSitemapDealId("136029")).toBe(false);
    expect(isIndexableSitemapDealId(undefined)).toBe(false);
  });
});

describe("canonicalSitemapUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits apex URLs with no query, www, or price-history", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.thedropper.shop");
    expect(canonicalSitemapUrl("/deals/42")).toBe(
      "https://thedropper.shop/deals/42",
    );
    expect(canonicalSitemapUrl("/deals/42?from=/deals")).toBe(
      "https://thedropper.shop/deals/42",
    );
    expect(canonicalSitemapUrl("/deals/42/price-history")).toBeNull();
    expect(canonicalSitemapUrl("https://thedropper.shop/deals/42")).toBeNull();
  });
});

describe("dealDetailSitemapEntries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps live deals and drops missing IDs and noindex surfaces", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://thedropper.shop");
    const entries = dealDetailSitemapEntries([
      { id: 10, last_scraped: "2026-09-21T00:00:00Z" },
      { id: 0 },
      { id: -1 },
      { id: 20 },
    ]);
    const urls = entries.map((e) => e.url);
    expect(urls).toEqual([
      "https://thedropper.shop/deals/10",
      "https://thedropper.shop/deals/20",
    ]);
    expect(urls.some((u) => u.includes("price-history"))).toBe(false);
    expect(urls.some((u) => u.includes("www."))).toBe(false);
    expect(urls.some((u) => u.includes("?"))).toBe(false);
    expect(entries[0]?.lastModified).toEqual(new Date("2026-09-21T00:00:00Z"));
  });

  it("caps deal URLs at the Google sitemap budget", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://thedropper.shop");
    const deals = Array.from({ length: MAX_DEAL_URLS_IN_SITEMAP + 5 }, (_, i) => ({
      id: i + 1,
    }));
    expect(dealDetailSitemapEntries(deals)).toHaveLength(MAX_DEAL_URLS_IN_SITEMAP);
  });
});
