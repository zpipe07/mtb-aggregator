import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichHayes, scrapeHayes } from "./hayes.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Dominion A4 Brake",
      handle: "dominion-a4-brake",
      vendor: "Hayes",
      product_type: "Brakes",
      options: [{ name: "Color", position: 1 }],
      images: [{ src: "https://cdn.shopify.com/dominion.jpg" }],
      variants: [
        {
          id: 101,
          sku: "HAY-A4-BLK",
          price: "149.99",
          compare_at_price: "199.99",
          available: true,
          option1: "Black",
          featured_image: { src: "https://cdn.shopify.com/dominion-black.jpg" },
        },
        {
          id: 102,
          sku: "HAY-A4-RED",
          price: "149.99",
          compare_at_price: "199.99",
          available: false,
          option1: "Red",
        },
      ],
    },
  ],
};

describe("scrapeHayes", () => {
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

    const results = await scrapeHayes(
      "https://hayesbicycle.com/collections/outlet",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "HAY-A4-BLK",
      product_name: "Dominion A4 Brake",
      current_price: 149.99,
      original_price: 199.99,
      product_url: "https://hayesbicycle.com/products/dominion-a4-brake",
      brand: "Hayes",
      product_group_key: "dominion-a4-brake",
      variant_options: { Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "HAY-A4-RED",
      variant_options: { Color: "Red" },
      is_in_stock: false,
    });
  });
});

describe("enrichHayes", () => {
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
                "<table><tr><th>Rotor Size</th><td>203mm</td></tr></table><p>Hayes Dominion A4 brake with four-piston power for aggressive trail and enduro mountain biking on modern bikes.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Brakes"},{"name":"Dominion A4 Brake"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichHayes(
      "https://hayesbicycle.com/products/dominion-a4-brake",
    );

    expect(result.category_path).toEqual(["Brakes"]);
    expect(result.raw_specs).toEqual({ "Rotor Size": "203mm" });
    expect(result.description).toContain("Hayes Dominion");
  });
});
