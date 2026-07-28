import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichCanfield, scrapeCanfield } from "./canfield.js";

const COLLECTION_FIXTURE = {
  products: [
    {
      id: 1,
      title: "Yeti Frame",
      handle: "yeti-frame",
      vendor: "Canfield Bikes",
      product_type: "Frames",
      options: [
        { name: "Size", position: 1 },
        { name: "Color", position: 2 },
      ],
      images: [{ src: "https://cdn.shopify.com/yeti.jpg" }],
      variants: [
        {
          id: 101,
          sku: "CAN-YETI-M-BLK",
          price: "2499.00",
          compare_at_price: "2999.00",
          available: true,
          option1: "Medium",
          option2: "Black",
          featured_image: { src: "https://cdn.shopify.com/yeti-m-blk.jpg" },
        },
        {
          id: 102,
          sku: "CAN-YETI-L-RAW",
          price: "2499.00",
          compare_at_price: "2999.00",
          available: false,
          option1: "Large",
          option2: "Raw",
        },
      ],
    },
  ],
};

describe("scrapeCanfield", () => {
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

    const results = await scrapeCanfield(
      "https://canfieldbikes.com/collections/mtb-sale",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "CAN-YETI-M-BLK",
      product_name: "Yeti Frame",
      current_price: 2499,
      original_price: 2999,
      product_url: "https://canfieldbikes.com/products/yeti-frame",
      brand: "Canfield Bikes",
      product_group_key: "yeti-frame",
      variant_options: { Size: "Medium", Color: "Black" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "CAN-YETI-L-RAW",
      variant_options: { Size: "Large", Color: "Raw" },
      is_in_stock: false,
    });
  });
});

describe("enrichCanfield", () => {
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
                "<table><tr><th>Wheel Size</th><td>29</td></tr></table><p>Canfield Yeti frame built for aggressive trail riding with modern geometry and durable aluminum construction for all-mountain use.</p>",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Frames"},{"name":"Yeti Frame"}]}</script></html>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
      );

    const result = await enrichCanfield(
      "https://canfieldbikes.com/products/yeti-frame",
    );

    expect(result.category_path).toEqual(["Frames"]);
    expect(result.raw_specs).toEqual({ "Wheel Size": "29" });
    expect(result.description).toContain("Canfield Yeti");
  });
});
