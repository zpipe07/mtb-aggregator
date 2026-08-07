import { describe, expect, it } from "vitest";

import {
  enrichUniversalCyclesPdpFromHtml,
  parseUniversalCyclesAttributesFromHtml,
} from "./universalcycles-pdp.js";
import {
  buildSpecialsPageUrl,
  loadUniversalCyclesFixture,
  parseMaxResultPage,
  parseSalePricesFromBoxText,
  parseUniversalCyclesSpecialsHtml,
  splitCategoryHeader,
} from "./universalcycles-plp.js";

const PAGE1 = loadUniversalCyclesFixture("specials-page1.html");
const PAGE7 = loadUniversalCyclesFixture("specials-page7.html");

describe("universalcycles-plp helpers", () => {
  it("parses sale prices preferring overstock", () => {
    expect(
      parseSalePricesFromBoxText(
        "From: $73.00 Overstock Item From: $49.00 MSRP: $74.99",
      ).currentPrice,
    ).toBe(49);
    expect(
      parseSalePricesFromBoxText("Closeout From: $59.99 MSRP: $145.00")
        .originalPrice,
    ).toBe(145);
  });

  it("parses comma-separated thousands in sale prices", () => {
    expect(
      parseSalePricesFromBoxText("From: $1,299.99 MSRP: $2,000.00").currentPrice,
    ).toBe(1299.99);
    expect(
      parseSalePricesFromBoxText(
        "Closeout From: $3,499.99 MSRP: $5,550.00",
      ).currentPrice,
    ).toBe(3499.99);
    expect(
      parseSalePricesFromBoxText("Overstock Item From: $1,299.99").currentPrice,
    ).toBe(1299.99);
  });

  it("splits category headers", () => {
    expect(splitCategoryHeader("Cane Creek Suspension Seatposts")).toEqual([
      "Cane Creek",
      "Suspension Seatposts",
    ]);
    expect(splitCategoryHeader("Fox Racing Shox Forks - MTB Suspension")).toEqual([
      "Fox Racing Shox Forks",
      "MTB Suspension",
    ]);
  });

  it("builds pagination URLs", () => {
    expect(buildSpecialsPageUrl("https://www.universalcycles.com/specials.php", 1)).toBe(
      "https://www.universalcycles.com/specials.php",
    );
    expect(buildSpecialsPageUrl("https://www.universalcycles.com/specials.php", 3)).toBe(
      "https://www.universalcycles.com/specials.php?resultpage=3",
    );
  });

  it("detects max result page", () => {
    expect(parseMaxResultPage(PAGE1)).toBe(7);
  });
});

describe("parseUniversalCyclesSpecialsHtml", () => {
  it("extracts products from page 1 fixture", () => {
    const rows = parseUniversalCyclesSpecialsHtml(PAGE1);
    expect(rows.length).toBeGreaterThan(90);
    const kahva = rows.find((r) => r.store_sku === "104225");
    expect(kahva?.current_price).toBe(59.99);
    expect(kahva?.original_price).toBe(145);
    expect(kahva?.product_group_key).toBe("104225");
    expect(kahva?.category_path?.[0]).toBe("45NRTH");

    const synapse = rows.find((r) => r.store_sku === "111070");
    expect(synapse?.current_price).toBe(3499.99);
    expect(synapse?.original_price).toBe(5550);
  });

  it("extracts products from page 7 fixture", () => {
    const rows = parseUniversalCyclesSpecialsHtml(PAGE7);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.length).toBeLessThan(20);
  });
});

describe("universalcycles-pdp", () => {
  const pdpUrl = (id: string) =>
    `https://www.universalcycles.com/shopping/product_details.php?id=${id}`;

  it("parses single-attribute OOS seatpost", () => {
    const html = loadUniversalCyclesFixture("pdp-96187.html");
    const variants = parseUniversalCyclesAttributesFromHtml(html, pdpUrl("96187"));
    expect(variants).toHaveLength(1);
    expect(variants[0].code).toBe("96187-262627");
    expect(variants[0].is_orderable).toBe(false);
    expect(variants[0].current_price).toBe(129.99);
  });

  it("parses mixed-stock Fox dropper with 5 variants", () => {
    const html = loadUniversalCyclesFixture("pdp-102857.html");
    const variants = parseUniversalCyclesAttributesFromHtml(html, pdpUrl("102857"));
    expect(variants).toHaveLength(5);
    const oos = variants.find((v) => v.code.endsWith("-254029"));
    expect(oos?.is_orderable).toBe(false);
    const inStock = variants.find((v) => v.code.endsWith("-254025"));
    expect(inStock?.is_orderable).toBe(true);
  });

  it("parses 6-variant Odyssey crank", () => {
    const html = loadUniversalCyclesFixture("pdp-106730.html");
    const variants = parseUniversalCyclesAttributesFromHtml(html, pdpUrl("106730"));
    expect(variants).toHaveLength(6);
    expect(variants.every((v) => v.is_orderable)).toBe(true);
    expect(variants.find((v) => v.code === "106730-264711")?.current_price).toBeGreaterThan(
      0,
    );
  });

  it("parses 7-variant Stans rim tape", () => {
    const html = loadUniversalCyclesFixture("pdp-12846.html");
    const variants = parseUniversalCyclesAttributesFromHtml(html, pdpUrl("12846"));
    expect(variants).toHaveLength(7);
  });

  it("parses 2-variant tire PDP", () => {
    const html = loadUniversalCyclesFixture("pdp-104220.html");
    const variants = parseUniversalCyclesAttributesFromHtml(html, pdpUrl("104220"));
    expect(variants).toHaveLength(2);
  });

  it("returns description and specs from enrich", () => {
    const html = loadUniversalCyclesFixture("pdp-96187.html");
    const result = enrichUniversalCyclesPdpFromHtml(html, pdpUrl("96187"));
    expect(result.description).toMatch(/eeSilk/i);
    expect(result.raw_specs?.Diameter).toBe("31.6mm");
    expect(result.variants).toHaveLength(1);
  });
});
