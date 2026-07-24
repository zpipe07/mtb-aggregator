import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichRaceFace, scrapeRaceFace } from "./raceface.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Chester Pedals 2020",
      handle: "chester-pedals-2020",
      vendor: "Race Face",
      product_type: "Pedals",
      options: [{ name: "Color", position: 1 }],
      images: [{ src: "https://cdn.shopify.com/chester.jpg" }],
      variants: [
        {
          id: 101,
          sku: "RF-CHESTER-RED",
          price: "20.00",
          compare_at_price: "39.00",
          available: true,
          option1: "Red",
          featured_image: { src: "https://cdn.shopify.com/chester-red.jpg" },
        },
        {
          id: 102,
          sku: "RF-CHESTER-GREEN",
          price: "20.00",
          compare_at_price: "39.00",
          available: false,
          option1: "Green",
        },
      ],
    },
  ],
};

describe("scrapeRaceFace", () => {
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

    const results = await scrapeRaceFace(
      "https://www.raceface.com/collections/outlet-sale",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "RF-CHESTER-RED",
      product_name: "Chester Pedals 2020",
      current_price: 20,
      original_price: 39,
      product_url: "https://www.raceface.com/products/chester-pedals-2020",
      brand: "Race Face",
      product_group_key: "chester-pedals-2020",
      variant_options: { Color: "Red" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "RF-CHESTER-GREEN",
      variant_options: { Color: "Green" },
      is_in_stock: false,
    });
  });
});

describe("enrichRaceFace", () => {
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
                "<table><tr><th>Weight</th><td>380g</td></tr></table><p>Race Face Chester pedals deliver reliable grip and durability for trail and enduro mountain biking on modern bikes.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Pedals"},{"name":"Chester Pedals 2020"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichRaceFace(
      "https://www.raceface.com/products/chester-pedals-2020",
    );

    expect(result.category_path).toEqual(["Pedals"]);
    expect(result.raw_specs).toEqual({ Weight: "380g" });
    expect(result.description).toContain("Race Face Chester");
  });
});
