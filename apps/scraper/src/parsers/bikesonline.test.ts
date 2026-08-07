import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichBikesOnline, scrapeBikesOnline } from "./bikesonline.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Free Returns + Package Protection",
      handle: "free-returns-package-protection",
      vendor: "re:do",
      product_type: "return,package_protection",
      tags: ["exclude_rebuy", "pfs:hidden:recommendation"],
      options: [{ name: "Price", position: 1 }],
      images: [],
      variants: [
        {
          id: 101,
          sku: "x-redo",
          price: "10.98",
          compare_at_price: "10.98",
          available: true,
          option1: "$10.98",
        },
      ],
    },
    {
      id: 2,
      title: "Polygon Xtrada 7 - Mountain Bike",
      handle: "xtrada7",
      vendor: "Polygon",
      product_type: "Mountain Bike",
      options: [
        { name: "Size", position: 1 },
        { name: "Color", position: 2 },
      ],
      images: [{ src: "https://cdn.shopify.com/xtrada.jpg" }],
      variants: [
        {
          id: 201,
          sku: "XTRADA-M-BLK",
          price: "1099.99",
          compare_at_price: "1199.99",
          available: true,
          option1: "Medium",
          option2: "Black",
          featured_image: { src: "https://cdn.shopify.com/xtrada-m.jpg" },
        },
        {
          id: 202,
          sku: "XTRADA-L-BLK",
          price: "1099.99",
          compare_at_price: "1199.99",
          available: false,
          option1: "Large",
          option2: "Black",
        },
      ],
    },
  ],
};

describe("scrapeBikesOnline", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("skips package-protection add-ons and emits one row per variant", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(COLLECTION_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const results = await scrapeBikesOnline(
      "https://www.bikesonline.com/collections/sale",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "XTRADA-M-BLK",
      product_name: "Polygon Xtrada 7 - Mountain Bike",
      current_price: 1099.99,
      original_price: 1199.99,
      product_url: "https://www.bikesonline.com/products/xtrada7",
      brand: "Polygon",
      product_group_key: "xtrada7",
      variant_options: { Size: "Medium", Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "XTRADA-L-BLK",
      variant_options: { Size: "Large", Color: "Black" },
      is_in_stock: false,
    });
  });
});

describe("enrichBikesOnline", () => {
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
                "<table><tr><th>Frame Material</th><td>Aluminum</td></tr></table><p>Polygon Xtrada 7 is a capable trail hardtail mountain bike with modern geometry and reliable components for everyday riding.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Mountain Bikes"},{"name":"Polygon Xtrada 7"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichBikesOnline(
      "https://www.bikesonline.com/products/xtrada7",
    );

    expect(result.category_path).toEqual(["Mountain Bikes"]);
    expect(result.raw_specs).toEqual({ "Frame Material": "Aluminum" });
    expect(result.description).toContain("Polygon Xtrada 7");
  });
});
