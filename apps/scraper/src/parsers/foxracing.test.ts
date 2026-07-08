import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichFoxRacingPdpFromHtml,
  parseFoxColorVariantsFromHtml,
  parseFoxSelectableSizes,
} from "./foxracing-pdp.js";
import {
  categoryPathFromGtm,
  loadFoxRacingGridFixture,
  parseColorCodeFromProductUrl,
  parseFoxProductGridHtml,
  parseGtmData,
  parseProductGroupKey,
  parseUsdPrice,
} from "./foxracing-plp.js";
import { enrichFoxRacing, scrapeFoxRacing } from "./foxracing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRID_FIXTURE = loadFoxRacingGridFixture("grid-page-0.html");
const PDP_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "foxracing", "pdp-dropframe-helmet.html"),
  "utf8",
);
const PDP_SHOES_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "foxracing", "pdp-union-flat-shoes.html"),
  "utf8",
);

describe("foxracing-plp helpers", () => {
  it("parses USD prices", () => {
    expect(parseUsdPrice("$199.99")).toBe(199.99);
    expect(parseUsdPrice("$249.95")).toBe(249.95);
    expect(parseUsdPrice("")).toBeNull();
  });

  it("parses color and product group from product URLs", () => {
    const url =
      "https://www.foxracing.com/product/dropframe-helmet/VG-31930-001.html?dwvar_VG-31930-001_color=001&cgid=sale-mtb";
    expect(parseColorCodeFromProductUrl(url)).toBe("001");
    expect(parseProductGroupKey("VG-31930-001")).toBe("VG-31930");
  });

  it("builds category path from GTM data", () => {
    const gtm = parseGtmData(
      '{"item_category":"Revelyst","item_category2":"Open Face","item_category3":"Adult Helmets","item_category4":"MTB","item_category5":"Legacy Drops"}',
    );
    expect(categoryPathFromGtm(gtm)).toEqual([
      "Open Face",
      "Adult Helmets",
      "MTB",
    ]);
  });
});

describe("parseFoxProductGridHtml", () => {
  it("extracts sale tiles from Demandware grid HTML", () => {
    const rows = parseFoxProductGridHtml(GRID_FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const helmet = rows.find((r) => r.product_name === "Dropframe Helmet");
    expect(helmet).toBeDefined();
    expect(helmet!.current_price).toBe(199.99);
    expect(helmet!.original_price).toBe(249.95);
    expect(helmet!.brand).toBe("Fox");
    expect(helmet!.store_sku).toBe("VG-31930-001");
    expect(helmet!.product_group_key).toBe("VG-31930");
    expect(helmet!.variant_options?.Color).toBe("001");
    expect(helmet!.product_url).toContain("VG-31930-001.html");
    expect(helmet!.category_path?.length).toBeGreaterThan(0);
  });
});

describe("foxracing-pdp", () => {
  it("enriches from PDP HTML fixture", () => {
    const result = enrichFoxRacingPdpFromHtml(PDP_FIXTURE);
    expect(result.category_path).toEqual(["MTB"]);
    expect(result.description?.length).toBeGreaterThan(20);
    expect(result.raw_specs && Object.keys(result.raw_specs).length).toBeGreaterThan(
      0,
    );
  });

  it("parses color variants and sizes for variant grouping", () => {
    const variants = parseFoxColorVariantsFromHtml(PDP_SHOES_FIXTURE, "VG-29354-001");
    expect(variants.length).toBeGreaterThanOrEqual(3);
    const black = variants.find((v) => v.code === "VG-29354-001");
    expect(black?.dimensions.Color).toBe("Black");
    expect(black?.is_orderable).toBe(true);

    const sizes = parseFoxSelectableSizes(PDP_SHOES_FIXTURE);
    expect(sizes.length).toBeGreaterThan(0);

    const enriched = enrichFoxRacingPdpFromHtml(PDP_SHOES_FIXTURE);
    expect(enriched.variants?.length).toBeGreaterThanOrEqual(3);
    expect(enriched.raw_specs?.["Available sizes"]).toContain("42");
  });
});

describe("scrapeFoxRacing / enrichFoxRacing", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("paginates sale grid until empty page", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(GRID_FIXTURE, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<div></div>", {
          status: 200,
        }),
      );

    const rows = await scrapeFoxRacing(
      "https://www.foxracing.com/legacy-drops/mtb/",
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("fetch enrich returns category or specs", async () => {
    vi.useFakeTimers();
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(PDP_FIXTURE, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const resultPromise = enrichFoxRacing(
      "https://www.foxracing.com/product/dropframe-helmet/VG-31930-001.html",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result).toHaveProperty("category_path");
    expect(result).toHaveProperty("raw_specs");
  });
});
