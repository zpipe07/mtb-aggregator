import { describe, expect, it } from "vitest";
import type { Deal, DealVariantRow } from "@/api";
import {
  compactChipGroup,
  compareVariantChipLabels,
  displayPriceRange,
  extractedBikeSize,
  inStockDealVariants,
  inStockPriceRange,
  limitChips,
  orderedVariantOptionEntries,
  sizeFromStoreSku,
  summarizeDealSizeChips,
  summarizeInStockVariantChips,
} from "./inStockVariantChips";

const baseDeal: Deal = {
  id: 1,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-M",
  product_name: "Marin Hawk Hill",
  current_price: 1499,
  original_price: 1999,
  product_url: "https://example.com/hawk",
  brand: "Marin",
  is_in_stock: true,
  last_scraped: "2026-09-01T12:00:00Z",
};

function row(
  partial: Partial<DealVariantRow> & Pick<DealVariantRow, "id" | "store_sku">,
): DealVariantRow {
  return {
    current_price: 1499,
    is_in_stock: true,
    ...partial,
  };
}

describe("compareVariantChipLabels", () => {
  it("orders clothing/bike letter sizes", () => {
    const labels = ["XL", "S", "XXL", "M", "XS", "L"];
    expect(labels.toSorted(compareVariantChipLabels)).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
    ]);
  });

  it("orders word sizes and numeric frame sizes", () => {
    expect(["Large", "Small", "Medium"].toSorted(compareVariantChipLabels)).toEqual([
      "Small",
      "Medium",
      "Large",
    ]);
    expect(["17.5", "15", "19"].toSorted(compareVariantChipLabels)).toEqual([
      "15",
      "17.5",
      "19",
    ]);
  });
});

describe("summarizeInStockVariantChips", () => {
  it("hides sold-out sizes and keeps in-stock size chips", () => {
    const deal: Deal = {
      ...baseDeal,
      variant_count: 4,
      variants: [
        row({
          id: 1,
          store_sku: "xs",
          variant_options: { Size: "XS", Color: "Green" },
          is_in_stock: false,
        }),
        row({
          id: 2,
          store_sku: "s",
          variant_options: { Size: "S", Color: "Green" },
        }),
        row({
          id: 3,
          store_sku: "m",
          variant_options: { Size: "M", Color: "Green" },
        }),
        row({
          id: 4,
          store_sku: "xl",
          variant_options: { Size: "XL", Color: "Green" },
          is_in_stock: false,
        }),
      ],
    };

    const summary = summarizeInStockVariantChips(deal);
    expect(summary).not.toBeNull();
    expect(summary!.sizes.map((c) => c.label)).toEqual(["S", "M"]);
    expect(summary!.colors.map((c) => c.label)).toEqual(["Green"]);
    expect(summary!.inStockCount).toBe(2);
    expect(summary!.listedCount).toBe(4);
    expect(inStockDealVariants(deal).map((v) => v.store_sku)).toEqual(["s", "m"]);
  });

  it("flags per-size price spread and ranges within a size", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "s-green",
          variant_options: { Size: "S", Color: "Green" },
          current_price: 4199,
        }),
        row({
          id: 2,
          store_sku: "s-blue",
          variant_options: { Size: "S", Color: "Blue" },
          current_price: 4499,
        }),
        row({
          id: 3,
          store_sku: "l",
          variant_options: { Size: "L", Color: "Green" },
          current_price: 5199,
        }),
      ],
    };

    const summary = summarizeInStockVariantChips(deal);
    expect(summary!.sizesHavePriceSpread).toBe(true);
    expect(summary!.sizes).toEqual([
      { label: "S", minPrice: 4199, maxPrice: 4499 },
      { label: "L", minPrice: 5199, maxPrice: 5199 },
    ]);
  });

  it("does not flag a spread when every in-stock size shares one price", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({ id: 1, store_sku: "s", variant_options: { Size: "S" }, current_price: 119 }),
        row({ id: 2, store_sku: "m", variant_options: { Size: "M" }, current_price: 119 }),
        row({
          id: 3,
          store_sku: "l",
          variant_options: { Size: "L" },
          current_price: 89,
          is_in_stock: false,
        }),
      ],
    };
    expect(summarizeInStockVariantChips(deal)!.sizesHavePriceSpread).toBe(false);
  });

  it("falls back to the listing variant_options when variants[] is absent", () => {
    const deal: Deal = {
      ...baseDeal,
      variant_options: { Size: "Medium", Color: "Black" },
    };
    const summary = summarizeInStockVariantChips(deal);
    expect(summary!.sizes.map((c) => c.label)).toEqual(["Medium"]);
    expect(summary!.colors.map((c) => c.label)).toEqual(["Black"]);
  });

  it("returns null when options are missing or every variant is sold out", () => {
    expect(
      summarizeInStockVariantChips({
        ...baseDeal,
        variants: [row({ id: 1, store_sku: "a" })],
      }),
    ).toBeNull();
    expect(
      summarizeInStockVariantChips({
        ...baseDeal,
        variants: [
          row({
            id: 1,
            store_sku: "s",
            variant_options: { Size: "S" },
            is_in_stock: false,
          }),
        ],
      }),
    ).toBeNull();
  });

  it("computes price range from in-stock variants only", () => {
    const deal: Deal = {
      ...baseDeal,
      current_price: 3490,
      price_range: [3490, 6999],
      variants: [
        row({
          id: 1,
          store_sku: "l",
          variant_options: { Size: "Large" },
          current_price: 3490,
        }),
        row({
          id: 2,
          store_sku: "xl",
          variant_options: { Size: "X-Large" },
          current_price: 6999,
          is_in_stock: false,
        }),
      ],
    };
    expect(inStockPriceRange(deal)).toEqual({
      min: 3490,
      max: 3490,
      spread: false,
    });
    expect(displayPriceRange(deal)).toBeUndefined();
  });

  it("keeps an in-stock price spread for display", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({ id: 1, store_sku: "s", variant_options: { Size: "S" }, current_price: 4199 }),
        row({ id: 2, store_sku: "l", variant_options: { Size: "L" }, current_price: 5199 }),
      ],
    };
    expect(displayPriceRange(deal)).toEqual([4199, 5199]);
  });

  it("omits hex-only color swatches", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "a",
          variant_options: { Color: "#A3938B : #231F18", Size: "S1" },
        }),
        row({
          id: 2,
          store_sku: "b",
          variant_options: { Color: "#4F4E53" },
        }),
      ],
    };
    const summary = summarizeInStockVariantChips(deal)!;
    expect(summary.colors).toEqual([]);
    expect(summary.sizes.map((c) => c.label)).toEqual(["S1"]);
  });

  it("treats Bike Size as a size dimension", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "s",
          variant_options: { "Bike Size": "S1", Color: "Red" },
        }),
        row({
          id: 2,
          store_sku: "m",
          variant_options: { "Bike Size": "S2", Color: "Red" },
        }),
      ],
    };
    expect(summarizeInStockVariantChips(deal)!.sizes.map((c) => c.label)).toEqual(
      ["S1", "S2"],
    );
  });

  it("infers Size from Jenson SKU suffixes when options are color-only (ZAC-276)", () => {
    const deal: Deal = {
      ...baseDeal,
      store_name: "JensonUSA",
      store_sku: "BI005147 RED/BLACK XL",
      product_name: "Marin Alpine Trail E1 Bosch E-Bike",
      variant_options: { Color: "Red/Black" },
      variants: [
        row({
          id: 1,
          store_sku: "BI005147 RED/BLACK M",
          variant_options: { Color: "Red/Black" },
        }),
        row({
          id: 2,
          store_sku: "BI005147 RED/BLACK XL",
          variant_options: { Color: "Red/Black" },
        }),
      ],
    };
    const summary = summarizeInStockVariantChips(deal)!;
    expect(summary.sizes.map((c) => c.label)).toEqual(["M", "XL"]);
    expect(compactChipGroup(summary)?.kind).toBe("size");
    expect(orderedVariantOptionEntries(deal.variants![1]!.variant_options, deal.variants![1]!.store_sku)).toEqual([
      ["Size", "XL"],
      ["Color", "Red/Black"],
    ]);
  });

  it("prefers SKU size over llm_specs.bike_size pulled from a size chart", () => {
    const deal: Deal = {
      ...baseDeal,
      store_sku: "BI004260 BLUE SZ4",
      variant_options: { Color: "Blue" },
      metadata: { llm_specs: { bike_size: "S1" } },
      variants: [
        row({
          id: 1,
          store_sku: "BI004260 BLUE SZ4",
          variant_options: { Color: "Blue" },
        }),
      ],
    };
    const summary = summarizeDealSizeChips(deal)!;
    expect(summary.sizes.map((c) => c.label)).toEqual(["S4"]);
    expect(compactChipGroup(summary)?.kind).toBe("size");
  });

  it("does not invent a size from a color-only SKU with no size token", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "ST192A02 RED",
          variant_options: { Color: "Red" },
        }),
      ],
    };
    const summary = summarizeInStockVariantChips(deal)!;
    expect(summary.sizes).toEqual([]);
    expect(summary.colors.map((c) => c.label)).toEqual(["Red"]);
    expect(compactChipGroup(summary)?.kind).toBe("color");
  });

  it("does not override an existing Size option with the SKU suffix", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "BI005147 RED/BLACK XL",
          variant_options: { Color: "Red/Black", Size: "Extra Large" },
        }),
      ],
    };
    expect(summarizeInStockVariantChips(deal)!.sizes.map((c) => c.label)).toEqual(
      ["Extra Large"],
    );
  });

  it("hides Jenson schema.org stock leftovers (ZAC-281)", () => {
    const deal: Deal = {
      ...baseDeal,
      id: 1120474,
      store_name: "JensonUSA",
      store_sku: "RS001370 00.4118.421.046",
      product_name: "RockShox Vivid Ultimate C1 Rear Shock",
      variant_options: {
        "Schema Stock Status": "https://schema.org/InStock",
      },
      variants: [
        row({
          id: 1120474,
          store_sku: "RS001370 00.4118.421.046",
          variant_options: {
            "Schema Stock Status": "https://schema.org/InStock",
          },
        }),
        row({
          id: 1120461,
          store_sku: "RS001370 00.4118.421.047",
          variant_options: {
            "Schema Stock Status": "https://schema.org/InStock",
          },
        }),
      ],
    };
    expect(summarizeInStockVariantChips(deal)).toBeNull();
    expect(orderedVariantOptionEntries(deal.variant_options, deal.store_sku)).toEqual(
      [],
    );
  });

  it("hides Shopify Title / Default Title placeholders (ZAC-278)", () => {
    const deal: Deal = {
      ...baseDeal,
      store_name: "365 Cycles",
      store_sku: "EP1213",
      product_name: "Bosch COBI.Bike iPhone Case",
      variant_options: { Title: "Default Title" },
    };
    expect(summarizeInStockVariantChips(deal)).toBeNull();
    expect(summarizeDealSizeChips(deal)).toBeNull();
    expect(
      orderedVariantOptionEntries(deal.variant_options, deal.store_sku),
    ).toEqual([]);
  });

  it("keeps real Size/Color chips when mixed with feed placeholders", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: [
        row({
          id: 1,
          store_sku: "BI005147 RED/BLACK XL",
          variant_options: {
            Color: "Red/Black",
            Size: "XL",
            "Schema Stock Status": "https://schema.org/InStock",
            Title: "Default Title",
          },
        }),
      ],
    };
    const summary = summarizeInStockVariantChips(deal)!;
    expect(summary.sizes.map((c) => c.label)).toEqual(["XL"]);
    expect(summary.colors.map((c) => c.label)).toEqual(["Red/Black"]);
    expect(summary.groups.map((g) => g.key)).toEqual(["Size", "Color"]);
    expect(compactChipGroup(summary)?.kind).toBe("size");
  });

  it("prefers size over color for compact cards and caps overflow", () => {
    const deal: Deal = {
      ...baseDeal,
      variants: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"].map((size, i) =>
        row({
          id: i + 1,
          store_sku: size,
          variant_options: { Size: size, Color: "Black" },
        }),
      ),
    };
    const summary = summarizeInStockVariantChips(deal)!;
    const compact = compactChipGroup(summary);
    expect(compact?.kind).toBe("size");
    expect(limitChips(compact!.chips).overflow).toBe(2);
    expect(limitChips(compact!.chips).visible.map((c) => c.label)).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
    ]);
  });
});

describe("extracted bike_size", () => {
  it("reads llm_specs.bike_size when no variant sizes exist", () => {
    const deal: Deal = {
      ...baseDeal,
      metadata: { llm_specs: { bike_size: "M" } },
    };
    expect(extractedBikeSize(deal)).toBe("M");
    const summary = summarizeDealSizeChips(deal);
    expect(summary?.sizes.map((c) => c.label)).toEqual(["M"]);
    expect(compactChipGroup(summary!)?.kind).toBe("size");
  });

  it("shows extracted road cm size", () => {
    const deal: Deal = {
      ...baseDeal,
      metadata: { llm_specs: { bike_size: "58cm" } },
    };
    expect(extractedBikeSize(deal)).toBe("58cm");
    expect(summarizeDealSizeChips(deal)?.sizes.map((c) => c.label)).toEqual([
      "58cm",
    ]);
  });

  it("prefers in-stock variant sizes over extracted bike_size", () => {
    const deal: Deal = {
      ...baseDeal,
      metadata: { llm_specs: { bike_size: "S" } },
      variants: [
        row({
          id: 2,
          store_sku: "xl",
          variant_options: { Size: "XL" },
        }),
      ],
    };
    expect(summarizeDealSizeChips(deal)?.sizes.map((c) => c.label)).toEqual([
      "XL",
    ]);
  });

  it("parses Jenson SKU size suffixes", () => {
    expect(sizeFromStoreSku("BI005147 RED/BLACK XL")).toBe("XL");
    expect(sizeFromStoreSku("BI004260 BLUE SZ4")).toBe("S4");
    expect(sizeFromStoreSku("JE002563 CREAM S")).toBe("S");
    expect(sizeFromStoreSku("SP002690 RED BLACK WHITE 22")).toBe("22");
    expect(sizeFromStoreSku("ST192A02 RED")).toBeNull();
    expect(sizeFromStoreSku("210000062051")).toBeNull();
  });

  it("hides extracted size when the listing is sold out", () => {
    const deal: Deal = {
      ...baseDeal,
      is_in_stock: false,
      metadata: { llm_specs: { bike_size: "L" } },
    };
    expect(summarizeDealSizeChips(deal)).toBeNull();
  });
});
