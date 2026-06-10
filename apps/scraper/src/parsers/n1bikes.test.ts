import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enrichN1BikesPdpFromHtml } from "./n1bikes-pdp.js";
import {
  buildN1ProductUrl,
  isN1VariantOnSale,
  parseDiscountThresholdFromUrl,
  parseN1CatalogItemsToResults,
  parseN1Price,
  slugifyN1ProductTitle,
  variantSupplierStock,
  type N1CatalogItem,
} from "./n1bikes-plp.js";
import { scrapeN1Bikes } from "./n1bikes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, "__fixtures__", "n1bikes", "search-page-1.json"),
    "utf8",
  ),
) as { items: N1CatalogItem[] };
const PDP_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "n1bikes", "pdp-gloves.html"),
  "utf8",
);

describe("n1bikes-plp helpers", () => {
  it("parses discount threshold from category URL", () => {
    expect(
      parseDiscountThresholdFromUrl(
        "https://www.n1bikes.com/categories/all?discount=0.2",
      ),
    ).toBe(0.2);
    expect(parseDiscountThresholdFromUrl("https://www.n1bikes.com/categories/all")).toBe(
      0.2,
    );
  });

  it("slugifies product titles for PDP paths", () => {
    expect(slugifyN1ProductTitle("100% Cognito Smart Shock Gloves - Black, Full Finger")).toBe(
      "100-percent-cognito-smart-shock-gloves-black-full-finger",
    );
  });

  it("parses map/msrp prices", () => {
    expect(parseN1Price("31.60")).toBe(31.6);
    expect(parseN1Price("$undefined")).toBeNull();
  });

  it("detects sale variants at or above discount threshold", () => {
    expect(isN1VariantOnSale(31.6, 39.5, 0.2)).toBe(true);
    expect(isN1VariantOnSale(39.5, 39.5, 0.2)).toBe(false);
  });

  it("sums supplier inventory for online stock", () => {
    const item = SEARCH_FIXTURE.items.find((i) =>
      i.group.title.includes("Cognito"),
    )!;
    const variant = item.group.variants.find((v) => v.sku === "GL4484")!;
    expect(variantSupplierStock(item, variant.id)).toBe(2);
  });

  it("builds canonical product URLs with group id", () => {
    const url = buildN1ProductUrl(
      "185bc027f1ad47d19f87ed26effb815b84640be379f72b7ffce9f0396901c102",
      "100% Cognito Smart Shock Gloves - Black, Full Finger",
    );
    expect(url).toContain("id=185bc027");
    expect(url).toContain("/products/100-percent-cognito-smart-shock-gloves-black-full-finger");
  });
});

describe("parseN1CatalogItemsToResults", () => {
  it("emits on-sale in-stock variants from MasterLinq search JSON", () => {
    const rows = parseN1CatalogItemsToResults(SEARCH_FIXTURE.items, 0.2);
    expect(rows.length).toBeGreaterThan(0);

    const glove = rows.find((r) => r.store_sku === "GL4484");
    expect(glove).toBeDefined();
    expect(glove!.current_price).toBe(31.6);
    expect(glove!.original_price).toBe(39.5);
    expect(glove!.brand).toBe("100%");
    expect(glove!.is_in_stock).toBe(true);
    expect(glove!.product_group_key).toBeTruthy();
    expect(glove!.variant_options?.Color).toBeTruthy();
  });

  it("skips variants that are not discounted enough", () => {
    const rows = parseN1CatalogItemsToResults(SEARCH_FIXTURE.items, 0.2);
    expect(rows.find((r) => r.store_sku === "GL00310")).toBeUndefined();
  });
});

describe("n1bikes-pdp", () => {
  it("extracts specifications and category from PDP HTML", () => {
    const result = enrichN1BikesPdpFromHtml(PDP_FIXTURE);
    expect(result.category_path?.[0]).toMatch(/Gloves/i);
    expect(result.raw_specs?.["Finger Style"]).toBeTruthy();
    expect(result.description?.length ?? 0).toBeGreaterThan(20);
  });
});

describe("scrapeN1Bikes / enrichN1Bikes", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("catalog/search")) {
          return new Response(JSON.stringify(SEARCH_FIXTURE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/products/")) {
          return new Response(PDP_FIXTURE, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("scrapeN1Bikes returns sale rows from catalog API", async () => {
    const rows = await scrapeN1Bikes(
      "https://www.n1bikes.com/categories/all?discount=0.2",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.store_sku === "GL4484")).toBe(true);
  });
});
