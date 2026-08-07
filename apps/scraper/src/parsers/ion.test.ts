import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichIon, parseShopifyStoresFromNuxtHtml, scrapeIon } from "./ion.js";

const SALE_HTML = `
  <script>window.__NUXT__={};window.__NUXT__.config={public:{shopify:{us:{domain:"secure-us.ion-products.com",storefrontAccessToken:"fixture-ion-storefront-token-us"},global:{domain:"secure.ion-products.com",storefrontAccessToken:"fixture-ion-storefront-token-global"}}}}</script>
  <a href="/en/us/products/youth-mtb-jersey-logo-dr-shortsleeve-47220-5010">Youth Jersey</a>
  <a href="/en/us/products/bike-pants-ionic-lt-men-47252-5123">Pants</a>
`;

const PRODUCT_47220 = {
  articleNumber: "47220-5010",
  webname: "Youth MTB Jersey Logo DR Shortsleeve",
  vendor: "ION Bike",
  category: "bikewear",
  commonCategory: "Bikewear",
  handle: "ion-bike-tee-logo-ss-dr-youth-2022",
  fromPrice: 27.99,
  description: "<p>Fast-drying youth jersey.</p>",
  keyFeatures: ["Moisture wicking"],
  variants: [
    {
      ean: "9010583100234",
      price: "27.99",
      color: "900 black",
      size: "128/8",
      availableForSale: true,
      image: {
        filename:
          "https://cdn.boards-and-more.com/example-youth-jersey.png",
      },
    },
  ],
};

const PRODUCT_47252 = {
  articleNumber: "47252-5123",
  webname: "Bike Pants Ionic LT men",
  vendor: "ION Bike",
  category: "bikewear",
  handle: "ion-iob-bike-pants-ionic-lt-men-2025",
  variants: [
    {
      ean: "9010583200439",
      price: "119.99",
      color: "900 black",
      size: "30/S",
      availableForSale: true,
      image: {
        filename: "https://cdn.boards-and-more.com/example-pants.png",
      },
    },
  ],
};

const REGIONAL_47220 = [
  {
    region: "us",
    language: "en",
    handle: "youth-mtb-jersey-logo-dr-shortsleeve",
    path: "/en/us/products/youth-mtb-jersey-logo-dr-shortsleeve-47220-5010",
  },
];

const REGIONAL_47252 = [
  {
    region: "us",
    language: "en",
    handle: "ion-iob-bike-pants-ionic-lt-men-2025",
    path: "/en/us/products/bike-pants-ionic-lt-men-47252-5123",
  },
];

function shopifyResponse(
  handle: string,
  variants: Array<{
    sku: string;
    price: string;
    compareAtPrice?: string;
    availableForSale?: boolean;
  }>,
) {
  return {
    data: {
      product: {
        title: handle,
        handle,
        variants: {
          edges: variants.map((v) => ({
            node: {
              sku: v.sku,
              title: v.sku,
              price: { amount: v.price },
              compareAtPrice: v.compareAtPrice
                ? { amount: v.compareAtPrice }
                : null,
              availableForSale: v.availableForSale ?? true,
            },
          })),
        },
      },
    },
  };
}

describe("scrapeIon", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("emits discounted variants with US product URLs and article-based group key", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes("/en/us/bike/sale")) {
        return new Response(SALE_HTML, { status: 200 });
      }
      if (url.endsWith("/api/product/47220-5010")) {
        return new Response(JSON.stringify(PRODUCT_47220), { status: 200 });
      }
      if (url.endsWith("/api/product/47252-5123")) {
        return new Response(JSON.stringify(PRODUCT_47252), { status: 200 });
      }
      if (url.includes("/regionalAvailability/47220-5010")) {
        return new Response(JSON.stringify(REGIONAL_47220), { status: 200 });
      }
      if (url.includes("/regionalAvailability/47252-5123")) {
        return new Response(JSON.stringify(REGIONAL_47252), { status: 200 });
      }
      if (url.includes("secure-us.ion-products.com")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          variables?: { handle?: string };
        };
        if (body.variables?.handle === "youth-mtb-jersey-logo-dr-shortsleeve") {
          return new Response(
            JSON.stringify(
              shopifyResponse("youth-mtb-jersey-logo-dr-shortsleeve", [
                {
                  sku: "9010583100234",
                  price: "27.99",
                  compareAtPrice: "39.99",
                },
              ]),
            ),
            { status: 200 },
          );
        }
        if (body.variables?.handle === "ion-iob-bike-pants-ionic-lt-men-2025") {
          return new Response(
            JSON.stringify(
              shopifyResponse("ion-iob-bike-pants-ionic-lt-men-2025", [
                {
                  sku: "9010583200439",
                  price: "119.99",
                  compareAtPrice: "129.99",
                },
              ]),
            ),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ data: { product: null } }),
          { status: 200 },
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    const results = await scrapeIon(
      "https://www.ion-products.com/en/us/bike/sale",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      store_sku: "9010583100234",
      product_name: "Youth MTB Jersey Logo DR Shortsleeve",
      current_price: 27.99,
      original_price: 39.99,
      product_url:
        "https://www.ion-products.com/en/us/products/youth-mtb-jersey-logo-dr-shortsleeve-47220-5010",
      brand: "ION Bike",
      product_group_key: "47220-5010",
      variant_options: { Color: "900 black", Size: "128/8" },
      is_in_stock: true,
    });
    expect(results[1]).toMatchObject({
      store_sku: "9010583200439",
      current_price: 119.99,
      original_price: 129.99,
      product_group_key: "47252-5123",
    });
  });
});

describe("parseShopifyStoresFromNuxtHtml", () => {
  it("extracts US and global storefront domains with US first", () => {
    const stores = parseShopifyStoresFromNuxtHtml(SALE_HTML);
    expect(stores).toEqual([
      {
        domain: "secure-us.ion-products.com",
        token: "fixture-ion-storefront-token-us",
      },
      {
        domain: "secure.ion-products.com",
        token: "fixture-ion-storefront-token-global",
      },
    ]);
  });
});

describe("enrichIon", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns category path, specs, and description from the product API", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(PRODUCT_47220), { status: 200 }),
    );

    const result = await enrichIon(
      "https://www.ion-products.com/en/us/products/youth-mtb-jersey-logo-dr-shortsleeve-47220-5010",
    );

    expect(result).toMatchObject({
      category_path: ["Bikewear"],
      raw_specs: {
        "Key features": "Moisture wicking",
      },
      description: "Fast-drying youth jersey.",
    });
  });
});
