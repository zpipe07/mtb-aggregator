import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichCambriaBikes, scrapeCambriaBikes } from "./cambriabikes.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Trail Bike",
      handle: "trail-bike",
      vendor: "Cambria",
      product_type: "Bikes",
      options: [
        { name: "Size", position: 1 },
        { name: "Color", position: 2 },
      ],
      images: [{ src: "https://cdn.shopify.com/trail-bike.jpg" }],
      variants: [
        {
          id: 101,
          sku: "TRAIL-M-BLK",
          price: "1999.00",
          compare_at_price: "2499.00",
          available: true,
          option1: "Medium",
          option2: "Black",
          featured_image: { src: "https://cdn.shopify.com/trail-bike-m.jpg" },
        },
        {
          id: 102,
          sku: "TRAIL-L-BLK",
          price: "1999.00",
          compare_at_price: "2499.00",
          available: false,
          option1: "Large",
          option2: "Black",
        },
      ],
    },
  ],
};

describe("scrapeCambriaBikes", () => {
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

    const results = await scrapeCambriaBikes(
      "https://cambriabike.com/collections/all-sale-products",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "TRAIL-M-BLK",
      product_name: "Trail Bike",
      current_price: 1999,
      original_price: 2499,
      product_url: "https://cambriabike.com/products/trail-bike",
      brand: "Cambria",
      product_group_key: "trail-bike",
      variant_options: { Size: "Medium", Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "TRAIL-L-BLK",
      variant_options: { Size: "Large", Color: "Black" },
      is_in_stock: false,
    });
  });
});

describe("enrichCambriaBikes", () => {
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
                "<table><tr><th>Frame</th><td>Carbon</td></tr></table><p>Lightweight trail bike built for aggressive riding on modern mountain bike trails with confidence and control.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Bikes"},{"name":"Trail Bike"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichCambriaBikes(
      "https://cambriabike.com/products/trail-bike",
    );

    expect(result.category_path).toEqual(["Bikes"]);
    expect(result.raw_specs).toEqual({ Frame: "Carbon" });
    expect(result.description).toContain("Lightweight trail bike");
  });
});
