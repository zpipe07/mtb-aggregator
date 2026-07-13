import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichChromag, scrapeChromag } from "./chromag.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "FU50",
      handle: "fu50",
      vendor: "Chromag Bikes",
      product_type: "Components",
      options: [{ name: "Color", position: 1 }],
      images: [{ src: "https://cdn.shopify.com/fu50.jpg" }],
      variants: [
        {
          id: 101,
          sku: "FU50-GOLD",
          price: "81.60",
          compare_at_price: "102.00",
          available: true,
          option1: "GOLD",
          featured_image: { src: "https://cdn.shopify.com/fu50-gold.jpg" },
        },
        {
          id: 102,
          sku: "FU50-RED",
          price: "81.60",
          compare_at_price: "102.00",
          available: false,
          option1: "RED",
        },
      ],
    },
  ],
};

describe("scrapeChromag", () => {
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

    const results = await scrapeChromag(
      "https://us.chromagbikes.com/collections/sale",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "FU50-GOLD",
      product_name: "FU50",
      current_price: 81.6,
      original_price: 102,
      product_url: "https://us.chromagbikes.com/products/fu50",
      brand: "Chromag Bikes",
      product_group_key: "fu50",
      variant_options: { Color: "GOLD" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "FU50-RED",
      variant_options: { Color: "RED" },
      is_in_stock: false,
    });
  });
});

describe("enrichChromag", () => {
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
                "<table><tr><th>Material</th><td>Aluminum</td></tr></table><p>Chromag stem with a lightweight aluminum construction designed for trail and enduro riding on modern mountain bikes.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Components"},{"name":"FU50"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichChromag(
      "https://us.chromagbikes.com/products/fu50",
    );

    expect(result.category_path).toEqual(["Components"]);
    expect(result.raw_specs).toEqual({ Material: "Aluminum" });
    expect(result.description).toContain("Chromag stem");
  });
});
