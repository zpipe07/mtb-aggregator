import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichCased, scrapeCased } from "./cased.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Trail Helmet",
      handle: "trail-helmet",
      vendor: "Cased",
      product_type: "Helmets",
      options: [
        { name: "Size", position: 1 },
        { name: "Color", position: 2 },
      ],
      images: [{ src: "https://cdn.shopify.com/helmet.jpg" }],
      variants: [
        {
          id: 101,
          sku: "CASED-HELM-M-BLK",
          price: "89.00",
          compare_at_price: "119.00",
          available: true,
          option1: "Medium",
          option2: "Black",
          featured_image: { src: "https://cdn.shopify.com/helmet-m-blk.jpg" },
        },
        {
          id: 102,
          sku: "CASED-HELM-L-WHT",
          price: "89.00",
          compare_at_price: "119.00",
          available: false,
          option1: "Large",
          option2: "White",
        },
      ],
    },
  ],
};

describe("scrapeCased", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("emits one row per variant with product_group_key and variant_options", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(COLLECTION_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const results = await scrapeCased("https://ridecased.com/collections/mtb");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "CASED-HELM-M-BLK",
      product_name: "Trail Helmet",
      current_price: 89,
      original_price: 119,
      product_url: "https://ridecased.com/products/trail-helmet",
      brand: "Cased",
      product_group_key: "trail-helmet",
      variant_options: { Size: "Medium", Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "CASED-HELM-L-WHT",
      variant_options: { Size: "Large", Color: "White" },
      is_in_stock: false,
    });
  });
});

describe("enrichCased", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps product.json and HTML into EnrichResult", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            product: {
              body_html:
                "<table><tr><th>Weight</th><td>280g</td></tr></table><p>Cased trail helmet with MIPS protection and adjustable fit system for all-day comfort on aggressive mountain bike rides.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Helmets"},{"name":"Trail Helmet"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichCased(
      "https://ridecased.com/products/trail-helmet",
    );

    expect(result.category_path).toEqual(["Helmets"]);
    expect(result.raw_specs).toEqual({ Weight: "280g" });
    expect(result.description).toContain("Cased trail helmet");
  });
});
