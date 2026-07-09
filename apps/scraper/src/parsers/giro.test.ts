import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichGiroPdpFromHtml,
  parseGiroColorVariantsFromHtml,
  parseGiroSelectableSizes,
} from "./giro-pdp.js";
import {
  categoryPathFromGtm,
  loadGiroGridFixture,
  parseColorCodeFromProductUrl,
  parseGiroProductGridHtml,
  parseGtmData,
  parseMasterIdFromProductUrl,
  parseUsdPrice,
} from "./giro-plp.js";
import { enrichGiro, scrapeGiro } from "./giro.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRID_FIXTURE = loadGiroGridFixture("grid-page-0.html");
const PDP_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "giro", "pdp-syntax-mips.html"),
  "utf8",
);

describe("giro-plp helpers", () => {
  it("parses USD prices", () => {
    expect(parseUsdPrice("$111.99")).toBe(111.99);
    expect(parseUsdPrice("$159.95")).toBe(159.95);
    expect(parseUsdPrice("")).toBeNull();
  });

  it("parses color and master id from product URLs", () => {
    const url =
      "https://www.giro.com/product/syntax-mips-helmet/100000000300000101S.html?dwvar_100000000300000101S_color=1042&cgid=archive-cycling";
    expect(parseColorCodeFromProductUrl(url)).toBe("1042");
    expect(parseMasterIdFromProductUrl(url)).toBe("100000000300000101S");
  });

  it("builds category path from GTM data", () => {
    const gtm = parseGtmData(
      '{"item_category":"Archives","item_category2":"Cycling","item_category3":"Helmets","item_brand":"Giro"}',
    );
    expect(categoryPathFromGtm(gtm)).toEqual(["Cycling", "Helmets"]);
  });
});

describe("parseGiroProductGridHtml", () => {
  it("extracts sale tiles from Demandware grid HTML", () => {
    const rows = parseGiroProductGridHtml(GRID_FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const helmet = rows.find((r) => r.product_name === "Syntax Mips Helmet");
    expect(helmet).toBeDefined();
    expect(helmet!.current_price).toBe(111.99);
    expect(helmet!.original_price).toBe(159.95);
    expect(helmet!.brand).toBe("Giro");
    expect(helmet!.store_sku).toBe("100000000300000101S");
    expect(helmet!.product_group_key).toBe("100000000300000101S");
    expect(helmet!.variant_options?.Color).toBe("1042");
    expect(helmet!.product_url).toContain("100000000300000101S.html");
    expect(helmet!.category_path).toEqual(["Cycling", "Helmets"]);
  });
});

describe("giro-pdp", () => {
  it("enriches from PDP HTML fixture", () => {
    const url =
      "https://www.giro.com/product/syntax-mips-helmet/100000000300000101S.html?dwvar_100000000300000101S_color=1042";
    const result = enrichGiroPdpFromHtml(PDP_FIXTURE, url);
    expect(result.category_path?.length).toBeGreaterThan(0);
    expect(result.variants?.length).toBeGreaterThanOrEqual(3);
    const darkCherry = result.variants?.find((v) => v.code === "1042");
    expect(darkCherry?.dimensions.Color).toBe("Matte Dark Cherry Towers");
  });

  it("parses color variants from swatches", () => {
    const variants = parseGiroColorVariantsFromHtml(PDP_FIXTURE);
    expect(variants.some((v) => v.code === "1042")).toBe(true);
    expect(variants.some((v) => v.dimensions.Color === "Matte Black")).toBe(
      true,
    );
  });

  it("parses selectable sizes", () => {
    const sizes = parseGiroSelectableSizes(PDP_FIXTURE);
    expect(sizes).toContain("M");
  });
});

describe("giro scrape/enrich integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("Search-UpdateGrid")) {
          return new Response(GRID_FIXTURE, { status: 200 });
        }
        if (url.includes("syntax-mips-helmet")) {
          return new Response(PDP_FIXTURE, { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrapeGiro returns grid rows", async () => {
    const rows = await scrapeGiro("https://www.giro.com/archives/cycling/");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].brand).toBe("Giro");
  });

  it("enrichGiro returns category and variants", async () => {
    vi.useFakeTimers();
    const resultPromise = enrichGiro(
      "https://www.giro.com/product/syntax-mips-helmet/100000000300000101S.html?dwvar_100000000300000101S_color=1042",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();
    expect(result.variants?.length).toBeGreaterThan(0);
  });
});
