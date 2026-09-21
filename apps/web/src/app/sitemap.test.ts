import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    fetchCategoryTree: vi.fn(),
    fetchDeals: vi.fn(),
    fetchFacets: vi.fn(),
    fetchSitemapListings: vi.fn(),
  };
});

import {
  fetchCategoryTree,
  fetchDeals,
  fetchFacets,
  fetchSitemapListings,
} from "@/api";
import sitemap from "@/app/sitemap";

const fetchCategoryTreeMock = vi.mocked(fetchCategoryTree);
const fetchDealsMock = vi.mocked(fetchDeals);
const fetchFacetsMock = vi.mocked(fetchFacets);
const fetchSitemapListingsMock = vi.mocked(fetchSitemapListings);

describe("sitemap", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.thedropper.shop");
    fetchCategoryTreeMock.mockReset();
    fetchDealsMock.mockReset();
    fetchFacetsMock.mockReset();
    fetchSitemapListingsMock.mockReset();

    fetchCategoryTreeMock.mockResolvedValue([
      {
        id: 1,
        slug: "bikes",
        name: "Bikes",
        parent_id: null,
        sort_order: 0,
        depth: 0,
        deal_count: 10,
        product_count: 8,
        children: [
          {
            id: 2,
            slug: "bikes-mountain",
            name: "Mountain",
            parent_id: 1,
            sort_order: 0,
            depth: 1,
            deal_count: 10,
            product_count: 8,
            children: [],
          },
        ],
      },
      {
        id: 3,
        slug: "empty-shelf",
        name: "Empty",
        parent_id: null,
        sort_order: 1,
        depth: 0,
        deal_count: 0,
        product_count: 0,
        children: [],
      },
    ]);
    fetchDealsMock.mockImplementation(async (params) => {
      if (params?.brands?.includes("ThinBrand")) {
        return { deals: [], total_count: 1 };
      }
      if (params?.brands?.includes("Fox")) {
        return { deals: [], total_count: 12 };
      }
      if (params?.brands?.includes("SRAM")) {
        return { deals: [], total_count: 20 };
      }
      return { deals: [], total_count: 10 };
    });
    fetchFacetsMock.mockResolvedValue({
      spec_facets: [],
      brand_facets: [
        { value: "Fox", count: 12 },
        { value: "SRAM", count: 20 },
        { value: "Sram", count: 4 },
        { value: "ThinBrand", count: 4 },
        { value: "Tiny", count: 2 },
      ],
      price_range: { min: 0, max: 0 },
      total_matching: 0,
    });
    fetchSitemapListingsMock.mockResolvedValue([
      { id: 10, last_scraped: "2026-09-21T00:00:00Z" },
      { id: 20 },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists live hubs/categories/brands/deals and omits missing + noindex URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("https://thedropper.shop/");
    expect(urls).toContain("https://thedropper.shop/deals");
    expect(urls).toContain("https://thedropper.shop/categories");
    expect(urls).toContain("https://thedropper.shop/deals/c/bikes");
    expect(urls).toContain("https://thedropper.shop/deals/c/bikes/mountain");
    expect(urls).toContain("https://thedropper.shop/deals/hub/fox-forks");
    expect(urls).toContain("https://thedropper.shop/deals/brand/fox");
    expect(urls).toContain("https://thedropper.shop/deals/brand/sram");
    expect(urls).toContain("https://thedropper.shop/deals/10");
    expect(urls).toContain("https://thedropper.shop/deals/20");

    expect(urls.some((u) => u.includes("empty-shelf"))).toBe(false);
    expect(urls.some((u) => u.includes("/deals/brand/thinbrand"))).toBe(false);
    expect(urls.some((u) => u.includes("/deals/brand/tiny"))).toBe(false);
    expect(urls.filter((u) => u.includes("/deals/brand/sram"))).toHaveLength(1);
    expect(urls.some((u) => u.includes("price-history"))).toBe(false);
    expect(urls.some((u) => u.includes("www."))).toBe(false);
    expect(urls.some((u) => u.includes("?"))).toBe(false);
    expect(urls.some((u) => u.includes("/deals/999"))).toBe(false);
    expect(fetchSitemapListingsMock).toHaveBeenCalledWith(48_000);
  });

  it("falls back to paginated GET /deals when sitemap-listings is unavailable", async () => {
    fetchSitemapListingsMock.mockRejectedValue(new Error("not found"));
    fetchDealsMock.mockImplementation(async (params) => {
      if (params?.limit === 1 && params?.sort === "newest" && !params?.brands) {
        return { deals: [], total_count: 1 };
      }
      if (params?.sort === "newest") {
        return {
          deals: [
            {
              id: 55,
              store_id: 1,
              store_name: "Test",
              store_sku: "sku",
              product_name: "Live deal",
              current_price: 10,
              product_url: "https://example.com",
              is_in_stock: true,
              last_scraped: "2026-09-20T00:00:00Z",
            },
          ],
          total_count: 1,
        };
      }
      return { deals: [], total_count: 10 };
    });

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://thedropper.shop/deals/55");
    expect(urls.some((u) => u.includes("price-history"))).toBe(false);
  });
});
