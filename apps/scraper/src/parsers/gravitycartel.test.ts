import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichGravityCartel, scrapeGravityCartel } from "./gravitycartel.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "iXS Trigger Race Knee Guards",
      handle: "trigger-race-knee-guard",
      vendor: "iXS",
      product_type: "Lower Body Protection",
      options: [{ name: "Size", position: 1 }],
      images: [{ src: "https://cdn.shopify.com/knee.jpg" }],
      variants: [
        {
          id: 101,
          sku: "LBP9054",
          price: "39.90",
          compare_at_price: "155.00",
          available: true,
          option1: "XXL",
          featured_image: { src: "https://cdn.shopify.com/knee-xxl.jpg" },
        },
        {
          id: 102,
          sku: "LBP9053",
          price: "39.90",
          compare_at_price: "155.00",
          available: false,
          option1: "XL",
        },
      ],
    },
  ],
};

describe("scrapeGravityCartel", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("emits only in-stock variants with product_group_key and variant_options", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(COLLECTION_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const results = await scrapeGravityCartel(
      "https://thegravitycartel.com/collections/sale",
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      store_sku: "LBP9054",
      product_name: "iXS Trigger Race Knee Guards",
      current_price: 39.9,
      original_price: 155,
      product_url:
        "https://thegravitycartel.com/products/trigger-race-knee-guard",
      brand: "iXS",
      product_group_key: "trigger-race-knee-guard",
      variant_options: { Size: "XXL" },
      is_in_stock: true,
    });
  });
});

describe("enrichGravityCartel", () => {
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
                "<table><tr><th>Material</th><td>Neoprene</td></tr></table><p>Lightweight knee guards designed for demanding terrain with excellent protection-to-weight ratio for trail and enduro riding.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Protection"},{"name":"Knee Guards"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichGravityCartel(
      "https://thegravitycartel.com/products/trigger-race-knee-guard",
    );

    expect(result.category_path).toEqual(["Protection"]);
    expect(result.raw_specs).toEqual({ Material: "Neoprene" });
    expect(result.description).toContain("Lightweight knee guards");
  });
});
