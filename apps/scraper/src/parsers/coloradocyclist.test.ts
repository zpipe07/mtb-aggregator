import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrichColoradoCyclist,
  scrapeColoradoCyclist,
} from "./coloradocyclist.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Trail Helmet",
      handle: "trail-helmet",
      vendor: "Giro",
      product_type: "Helmets",
      options: [
        { name: "Size", position: 1 },
        { name: "Color", position: 2 },
      ],
      images: [{ src: "https://cdn.shopify.com/trail-helmet.jpg" }],
      variants: [
        {
          id: 101,
          sku: "HELMET-M-BLK",
          price: "89.99",
          compare_at_price: "119.99",
          available: true,
          option1: "Medium",
          option2: "Black",
          featured_image: { src: "https://cdn.shopify.com/trail-helmet-m.jpg" },
        },
        {
          id: 102,
          sku: "HELMET-L-BLK",
          price: "89.99",
          compare_at_price: "119.99",
          available: false,
          option1: "Large",
          option2: "Black",
        },
      ],
    },
  ],
};

describe("scrapeColoradoCyclist", () => {
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

    const results = await scrapeColoradoCyclist(
      "https://coloradocyclist.com/collections/all-sale-products",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "HELMET-M-BLK",
      product_name: "Trail Helmet",
      current_price: 89.99,
      original_price: 119.99,
      product_url: "https://coloradocyclist.com/products/trail-helmet",
      brand: "Giro",
      product_group_key: "trail-helmet",
      variant_options: { Size: "Medium", Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "HELMET-L-BLK",
      variant_options: { Size: "Large", Color: "Black" },
      is_in_stock: false,
    });
  });
});

describe("enrichColoradoCyclist", () => {
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
                "<table><tr><th>Weight</th><td>250g</td></tr></table><p>Lightweight trail helmet built for aggressive riding on modern mountain bike trails with confidence and control.</p>",
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

    const result = await enrichColoradoCyclist(
      "https://coloradocyclist.com/products/trail-helmet",
    );

    expect(result.category_path).toEqual(["Helmets"]);
    expect(result.raw_specs).toEqual({ Weight: "250g" });
    expect(result.description).toContain("Lightweight trail helmet");
  });
});
