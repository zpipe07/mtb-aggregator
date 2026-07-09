import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichBellPdpFromHtml,
  parseBellColorVariantsFromHtml,
  parseBellSelectableSizes,
} from "./bell-pdp.js";
import {
  categoryPathFromGtm,
  loadBellGridFixture,
  parseBellProductGridHtml,
  parseColorCodeFromProductUrl,
  parseGtmData,
  parseMasterIdFromProductUrl,
  parseUsdPrice,
} from "./bell-plp.js";
import { enrichBell, scrapeBell } from "./bell.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRID_FIXTURE = loadBellGridFixture("grid-page-0.html");
const PDP_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "bell", "pdp-avenue-mips.html"),
  "utf8",
);

describe("bell-plp helpers", () => {
  it("parses USD prices", () => {
    expect(parseUsdPrice("$63.98")).toBe(63.98);
    expect(parseUsdPrice("$89.95")).toBe(89.95);
    expect(parseUsdPrice("")).toBeNull();
  });

  it("parses color and master id from product URLs", () => {
    const url =
      "https://www.bellhelmets.com/product/avenue-mips/100000000300000120.html?dwvar_100000000300000120_color=5378&cgid=legacy-garage-cycling";
    expect(parseColorCodeFromProductUrl(url)).toBe("5378");
    expect(parseMasterIdFromProductUrl(url)).toBe("100000000300000120");
  });

  it("builds category path from GTM data", () => {
    const gtm = parseGtmData(
      '{"item_category":"Cycling","item_category2":"Legacy Garage","item_brand":"Bell"}',
    );
    expect(categoryPathFromGtm(gtm)).toEqual(["Cycling"]);
  });
});

describe("parseBellProductGridHtml", () => {
  it("extracts sale tiles from Demandware grid HTML", () => {
    const rows = parseBellProductGridHtml(GRID_FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const helmet = rows.find((r) => r.product_name === "Sanction 2 DLX MIPS");
    expect(helmet).toBeDefined();
    expect(helmet!.current_price).toBe(159.99);
    expect(helmet!.original_price).toBe(199.95);
    expect(helmet!.brand).toBe("Bell");
    expect(helmet!.store_sku).toMatch(/^BL-/);
    expect(helmet!.product_group_key).toBe("100000001500000025");
    expect(helmet!.variant_options?.Color).toBe("5070");
    expect(helmet!.product_url).toContain("100000001500000025.html");
    expect(helmet!.category_path?.length).toBeGreaterThan(0);
  });
});

describe("bell-pdp", () => {
  it("enriches from PDP HTML fixture", () => {
    const url =
      "https://www.bellhelmets.com/product/avenue-mips/100000000300000120.html?dwvar_100000000300000120_color=5378";
    const result = enrichBellPdpFromHtml(PDP_FIXTURE, url);
    expect(result.category_path?.length).toBeGreaterThan(0);
    expect(result.variants?.length).toBeGreaterThanOrEqual(3);
    const matteGray = result.variants?.find((v) => v.code === "4846");
    expect(matteGray?.dimensions.Color).toBe("Matte Gray");
  });

  it("parses color variants from swatches", () => {
    const variants = parseBellColorVariantsFromHtml(PDP_FIXTURE);
    expect(variants.some((v) => v.code === "5378")).toBe(true);
    expect(variants.some((v) => v.dimensions.Color === "Matte/Gloss Black-20")).toBe(
      true,
    );
  });

  it("parses selectable sizes", () => {
    const sizes = parseBellSelectableSizes(PDP_FIXTURE);
    expect(sizes).toContain("UXL");
  });
});

describe("bell scrape/enrich integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("Search-UpdateGrid")) {
          return new Response(GRID_FIXTURE, { status: 200 });
        }
        if (url.includes("avenue-mips")) {
          return new Response(PDP_FIXTURE, { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrapeBell returns grid rows", async () => {
    const rows = await scrapeBell(
      "https://www.bellhelmets.com/legacy-garage/cycling/",
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].brand).toBe("Bell");
  });

  it("enrichBell returns category and variants", async () => {
    vi.useFakeTimers();
    const resultPromise = enrichBell(
      "https://www.bellhelmets.com/product/avenue-mips/100000000300000120.html?dwvar_100000000300000120_color=5378",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();
    expect(result.variants?.length).toBeGreaterThan(0);
  });
});
