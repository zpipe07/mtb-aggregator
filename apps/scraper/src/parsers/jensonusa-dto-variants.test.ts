import { describe, it, expect } from "vitest";
import {
  parseProductDtoVariants,
  extractVariantDimensions,
  dimensionKeyToLabel,
  type JensonProductDto,
} from "./jensonusa-dto.js";

describe("dimensionKeyToLabel", () => {
  it("title-cases simple keys", () => {
    expect(dimensionKeyToLabel("color")).toBe("Color");
    expect(dimensionKeyToLabel("size")).toBe("Size");
  });

  it("splits camelCase", () => {
    expect(dimensionKeyToLabel("wheelSize")).toBe("Wheel Size");
  });

  it("handles snake_case", () => {
    expect(dimensionKeyToLabel("bar_width")).toBe("Bar Width");
  });
});

describe("extractVariantDimensions", () => {
  it("reads flat color string", () => {
    const v = { color: "Black", code: "X" };
    expect(extractVariantDimensions(v)).toEqual({ Color: "Black" });
  });

  it("reads size object with value and sortOrder", () => {
    const v = {
      size: { value: "8.5", sortOrder: 2978 },
      code: "X",
    };
    expect(extractVariantDimensions(v)).toEqual({ Size: "8.5" });
  });

  it("reads numeric value", () => {
    const v = { length: 100, code: "X" };
    expect(extractVariantDimensions(v)).toEqual({ Length: "100" });
  });

  it("skips empty strings", () => {
    const v = { color: "", size: { value: "M" }, code: "X" };
    expect(extractVariantDimensions(v)).toEqual({ Size: "M" });
  });

  it("ignores fixed fields", () => {
    const v = {
      code: "C1",
      listPrice: { amount: 10 },
      msrpPrice: { amount: 20 },
      mfgPartNumber: "MFG",
      color: "Red",
    };
    expect(extractVariantDimensions(v)).toEqual({ Color: "Red" });
  });
});

/** Race Face–style multi-variant clearance DTO (trimmed). */
const MULTI_VARIANT_DTO: JensonProductDto = {
  name: "Race Face Turbine R 35 Stem",
  url: "/race-face-turbine-r-35-stem",
  code: "ST192A02",
  brand: "Race Face",
  variants: [
    {
      code: "ST192A02BLK  50",
      color: "Black",
      listPrice: { amount: 69.99 },
      msrpPrice: { amount: 115.99 },
      imageUrl: "https://cdn.example/black.jpg",
    },
    {
      code: "ST192A02 RED 50",
      color: "Red",
      listPrice: { amount: 49.99 },
      msrpPrice: { amount: 115.99 },
      imageUrl: "https://cdn.example/red.jpg",
    },
    {
      code: "ST192A02 GREEN 32",
      color: "Green",
      listPrice: { amount: 49.99 },
      msrpPrice: { amount: 115.99 },
    },
  ],
  selectedVariant: {
    listPrice: { amount: 69.99 },
    msrpPrice: { amount: 115.99 },
  },
};

describe("parseProductDtoVariants", () => {
  it("emits one row per variant with distinct prices and SKUs", () => {
    const rows = parseProductDtoVariants(MULTI_VARIANT_DTO);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.sku).toBe("ST192A02BLK  50");
    expect(rows[0]!.currentPrice).toBe(69.99);
    expect(rows[0]!.variantOptions).toEqual({ Color: "Black", Size: "50" });
    expect(rows[0]!.productGroupKey).toBe("ST192A02");

    expect(rows[1]!.sku).toBe("ST192A02 RED 50");
    expect(rows[1]!.currentPrice).toBe(49.99);
    expect(rows[1]!.variantOptions).toEqual({ Color: "Red", Size: "50" });

    expect(rows[2]!.sku).toBe("ST192A02 GREEN 32");
    expect(rows[2]!.currentPrice).toBe(49.99);
    expect(rows[2]!.variantOptions).toEqual({ Color: "Green", Size: "32" });
  });

  it("preserves internal spacing in variant code (outer trim only)", () => {
    const rows = parseProductDtoVariants(MULTI_VARIANT_DTO);
    expect(rows[0]!.sku).toContain("  ");
  });

  it("infers Size from the variant code when the DTO only has Color", () => {
    const dto: JensonProductDto = {
      name: "Marin Alpine Trail E1 Bosch E-Bike",
      url: "/marin-alpine-trail-e1-bosch-e-bike-2024",
      code: "BI005147",
      variants: [
        {
          code: "BI005147 RED/BLACK XL",
          color: "Red/Black",
          listPrice: { amount: 3644.27 },
          msrpPrice: { amount: 5699 },
        },
        {
          code: "BI004260 BLUE SZ4",
          color: "Blue",
          listPrice: { amount: 2999.94 },
          msrpPrice: { amount: 5999 },
        },
      ],
    };
    const rows = parseProductDtoVariants(dto);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.variantOptions).toEqual({
      Color: "Red/Black",
      Size: "XL",
    });
    expect(rows[1]!.variantOptions).toEqual({
      Color: "Blue",
      Size: "S4",
    });
  });

  it("does not invent Size when the code has no size token", () => {
    const dto: JensonProductDto = {
      name: "Race Face Stem",
      url: "/stem",
      code: "ST192A02",
      variants: [
        {
          code: "ST192A02 RED",
          color: "Red",
          listPrice: { amount: 49.99 },
          msrpPrice: { amount: 115.99 },
        },
      ],
    };
    expect(parseProductDtoVariants(dto)[0]!.variantOptions).toEqual({
      Color: "Red",
    });
  });

  it("does not override a DTO size with the SKU suffix", () => {
    const dto: JensonProductDto = {
      name: "Marin Alpine Trail E1 Bosch E-Bike",
      url: "/marin-alpine-trail",
      code: "BI005147",
      variants: [
        {
          code: "BI005147 RED/BLACK XL",
          color: "Red/Black",
          size: { value: "Extra Large", sortOrder: 1 },
          listPrice: { amount: 3644.27 },
          msrpPrice: { amount: 5699 },
        },
      ],
    };
    expect(parseProductDtoVariants(dto)[0]!.variantOptions).toEqual({
      Color: "Red/Black",
      Size: "Extra Large",
    });
  });

  it("includes color and structured size when both present", () => {
    const dto: JensonProductDto = {
      name: "Test Shoe",
      url: "/test-shoe",
      code: "SH001",
      variants: [
        {
          code: "SH001-A",
          color: "Black",
          size: { value: "8.5", sortOrder: 2978 },
          listPrice: { amount: 99 },
          msrpPrice: { amount: 120 },
        },
      ],
    };
    const rows = parseProductDtoVariants(dto);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.variantOptions).toEqual({
      Color: "Black",
      Size: "8.5",
    });
  });

  it("maps unknown facet keys to labels", () => {
    const dto: JensonProductDto = {
      name: "Test Post",
      url: "/test-post",
      code: "P1",
      variants: [
        {
          code: "P1-100",
          length: "100mm",
          listPrice: { amount: 50 },
          msrpPrice: { amount: 80 },
        },
      ],
    };
    const rows = parseProductDtoVariants(dto);
    expect(rows[0]!.variantOptions).toEqual({ Length: "100mm" });
  });

  it("falls back to single row when variants is missing", () => {
    const dto: JensonProductDto = {
      name: "Shimano XT",
      url: "/shimano-xt",
      code: "SKU123",
      selectedVariant: {
        listPrice: { amount: 89.99 },
        msrpPrice: { amount: 119.99 },
      },
    };
    const rows = parseProductDtoVariants(dto);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sku).toBe("SKU123");
    expect(rows[0]!.productGroupKey).toBeNull();
    expect(rows[0]!.variantOptions).toBeNull();
  });

  it("falls back to single row when variants is empty array", () => {
    const dto: JensonProductDto = {
      name: "Shimano XT",
      url: "/shimano-xt",
      code: "SKU123",
      variants: [],
      selectedVariant: {
        listPrice: { amount: 89.99 },
        msrpPrice: { amount: 119.99 },
      },
    };
    const rows = parseProductDtoVariants(dto);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sku).toBe("SKU123");
  });

  it("returns empty array when DTO is invalid", () => {
    expect(parseProductDtoVariants({ name: "x", url: "" })).toEqual([]);
  });

  it("returns empty when all variants lack valid price", () => {
    const dto: JensonProductDto = {
      name: "Bad",
      url: "/bad",
      code: "B1",
      variants: [{ code: "V1", listPrice: { amount: 0 } }],
    };
    expect(parseProductDtoVariants(dto)).toEqual([]);
  });
});
