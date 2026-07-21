import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichEvo, mapEvoProductsToResults, scrapeEvo } from "./evo.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "SRAM PowerLink 9-Speed Chain Link",
      handle: "95760-sram-powerlink-9-speed-chain-link",
      vendor: "SRAM",
      product_type: "Chains",
      options: [{ name: "Color", position: 1 }],
      images: [
        {
          src: "https://cdn.shopify.com/s/files/1/0679/7882/1782/files/product-image.jpg",
        },
      ],
      variants: [
        {
          id: 101,
          sku: "EB-95760-1001",
          price: "2.54",
          compare_at_price: "2.99",
          available: true,
          option1: "Brass",
          featured_image: {
            src: "https://cdn.shopify.com/s/files/1/0679/7882/1782/files/product-image-brass.jpg",
          },
        },
        {
          id: 102,
          sku: "EB-95760-1002",
          price: "2.54",
          compare_at_price: "2.99",
          available: false,
          option1: "Silver",
        },
      ],
    },
  ],
};

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(
      async (
        fn: (args: { targetUrl: string; acceptHeader: string }) => Promise<{
          status: number;
          text: string;
        }>,
        args: { targetUrl: string; acceptHeader: string },
      ) => {
        const res = await fetch(args.targetUrl, {
          headers: { Accept: args.acceptHeader },
        });
        return { status: res.status, text: await res.text() };
      },
    ),
    close: vi.fn(),
  };
}

function mockRunWithBrowser() {
  vi.doMock("../browser.js", () => ({
    runWithBrowser: async <T>(fn: (browser: unknown) => Promise<T>) => {
      const page = createMockPage();
      const context = {
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const browser = {
        newContext: vi.fn().mockResolvedValue(context),
      };
      return fn(browser);
    },
  }));
}

describe("mapEvoProductsToResults", () => {
  it("emits one row per variant with product_group_key and variant_options", () => {
    const results = mapEvoProductsToResults(
      COLLECTION_FIXTURE.products,
      "https://www.evo.com",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "EB-95760-1001",
      product_name: "SRAM PowerLink 9-Speed Chain Link",
      current_price: 2.54,
      original_price: 2.99,
      product_url:
        "https://www.evo.com/products/95760-sram-powerlink-9-speed-chain-link",
      brand: "SRAM",
      product_group_key: "95760-sram-powerlink-9-speed-chain-link",
      variant_options: { Color: "Brass" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "EB-95760-1002",
      variant_options: { Color: "Silver" },
      is_in_stock: false,
    });
  });
});

describe("scrapeEvo", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
    mockRunWithBrowser();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock("../browser.js");
  });

  it("paginates collection products.json through the browser session", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(COLLECTION_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { scrapeEvo: scrape } = await import("./evo.js");
    const results = await scrape("https://www.evo.com/collections/bike-sale");

    expect(results).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.evo.com/collections/bike-sale/products.json?limit=250&page=1",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });
});

describe("enrichEvo", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
    mockRunWithBrowser();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock("../browser.js");
  });

  it("maps product.json and HTML into EnrichResult", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            product: {
              body_html:
                "<table><tr><th>Speed</th><td>9</td></tr></table><p>Connect your 9-speed chain with the SRAM PowerLink chain link designed for reliable trail and enduro drivetrains.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Components"},{"name":"Chains"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const { enrichEvo: enrich } = await import("./evo.js");
    const result = await enrich(
      "https://www.evo.com/products/95760-sram-powerlink-9-speed-chain-link",
    );

    expect(result.category_path).toEqual(["Components"]);
    expect(result.raw_specs).toEqual({ Speed: "9" });
    expect(result.description).toContain("SRAM PowerLink");
  });
});
