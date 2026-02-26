import { describe, it, expect } from "vitest";
import { parseProductDto, type JensonProductDto } from "./jensonusa-dto.js";

/**
 * Fixture matching JensonUSA's actual data-product-result-dto structure.
 * Uses listPrice (sale price) and msrpPrice (original/MSRP) - NOT originalPrice.
 * This test would have failed before we fixed the field names.
 */
const JENSONUSA_CLEARANCE_FIXTURE: JensonProductDto = {
  name: "Shimano XT M8100 Rear Derailleur",
  url: "/shimano-xt-m8100-rear-derailleur",
  code: "SKU123",
  brand: "Shimano",
  catalogNodeCodes: ["Derailleurs", "Mountain"],
  selectedVariant: {
    listPrice: { amount: 89.99 },
    msrpPrice: { amount: 119.99 },
    imageUrl: "https://cdn.jensonusa.com/img/123.jpg",
  },
};

describe("parseProductDto", () => {
  it("extracts original_price from msrpPrice (JensonUSA actual field)", () => {
    const result = parseProductDto(JENSONUSA_CLEARANCE_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.originalPrice).toBe(119.99);
    expect(result!.currentPrice).toBe(89.99);
  });

  it("extracts current_price from listPrice", () => {
    const result = parseProductDto(JENSONUSA_CLEARANCE_FIXTURE);
    expect(result!.currentPrice).toBe(89.99);
  });

  it("computes correct discount when both prices present", () => {
    const result = parseProductDto(JENSONUSA_CLEARANCE_FIXTURE);
    const discountPct =
      result!.originalPrice && result!.currentPrice
        ? (1 - result!.currentPrice / result!.originalPrice) * 100
        : 0;
    expect(discountPct).toBeCloseTo(25, 0); // ~25% off
  });

  it("falls back to root msrpPrice when selectedVariant.msrpPrice missing", () => {
    const dto: JensonProductDto = {
      ...JENSONUSA_CLEARANCE_FIXTURE,
      selectedVariant: { listPrice: { amount: 89.99 } },
      msrpPrice: { amount: 129.99 },
    };
    const result = parseProductDto(dto);
    expect(result!.originalPrice).toBe(129.99);
  });

  it("falls back to MSRP regex in container text when DTO has no msrpPrice", () => {
    const dto: JensonProductDto = {
      ...JENSONUSA_CLEARANCE_FIXTURE,
      selectedVariant: { listPrice: { amount: 89.99 } },
    };
    delete (dto.selectedVariant as Record<string, unknown>).msrpPrice;
    delete dto.msrpPrice;
    const result = parseProductDto(dto, "Some text MSRP $99.99 more text");
    expect(result!.originalPrice).toBe(99.99);
  });

  it("would fail if we used originalPrice instead of msrpPrice (wrong field)", () => {
    // JensonUSA uses msrpPrice, NOT originalPrice. A DTO with only msrpPrice
    // must yield original_price. Using originalPrice would return null.
    const dtoWithOnlyMsrpPrice: JensonProductDto = {
      name: "Test Product",
      url: "/test",
      code: "T1",
      selectedVariant: {
        listPrice: { amount: 50 },
        msrpPrice: { amount: 100 },
      },
    };
    const result = parseProductDto(dtoWithOnlyMsrpPrice);
    expect(result!.originalPrice).toBe(100);
    // If we had used originalPrice (wrong field), this would be null
  });

  it("returns null original_price when neither DTO nor container has MSRP", () => {
    const dto: JensonProductDto = {
      ...JENSONUSA_CLEARANCE_FIXTURE,
      selectedVariant: { listPrice: { amount: 89.99 } },
    };
    delete (dto.selectedVariant as Record<string, unknown>).msrpPrice;
    delete dto.msrpPrice;
    const result = parseProductDto(dto, "No MSRP here");
    expect(result!.originalPrice).toBeNull();
  });

  it("always returns null category_path (Jenson category comes from enrichment/PDP breadcrumbs)", () => {
    const result = parseProductDto(JENSONUSA_CLEARANCE_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.category_path).toBeNull();
    // Even with catalogNodeCodes that look human-readable, we do not use them
    const dtoWithCodes: JensonProductDto = {
      ...JENSONUSA_CLEARANCE_FIXTURE,
      catalogNodeCodes: ["Derailleurs", "Mountain"],
    };
    expect(parseProductDto(dtoWithCodes)!.category_path).toBeNull();
  });
});
