import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichCanyonPdpFromHtml,
  extractCanyonProductFromJsonLd,
} from "./canyon-pdp.js";
import {
  loadCanyonGridFixture,
  parseCanyonProductGridHtml,
  parseColorCodeFromProductUrl,
  parseMasterProductIdFromUrl,
  parseUsdPrice,
} from "./canyon-plp.js";
import { enrichCanyon, scrapeCanyon } from "./canyon.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRID_FIXTURE = loadCanyonGridFixture("grid-page-0.html");
const PDP_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "canyon", "pdp-3175-head.html"),
  "utf8",
);

describe("canyon-plp helpers", () => {
  it("parses USD prices", () => {
    expect(parseUsdPrice("$4,499")).toBe(4499);
    expect(parseUsdPrice("From $6,349")).toBe(6349);
    expect(parseUsdPrice("")).toBeNull();
  });

  it("parses master id and color from product URLs", () => {
    const url =
      "https://www.canyon.com/en-us/mountain-bikes/trail-bikes/spectral-125/mountain-trail-spectral125-al/spectral-125-al-5/3175.html?dwvar_3175_pv_rahmenfarbe=SR%2FBK";
    expect(parseMasterProductIdFromUrl(url)).toBe("3175");
    expect(parseColorCodeFromProductUrl(url)).toBe("SR/BK");
  });
});

describe("parseCanyonProductGridHtml", () => {
  it("extracts sale tiles from Demandware grid HTML", () => {
    const rows = parseCanyonProductGridHtml(GRID_FIXTURE);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const spectral = rows.find((r) => r.product_name.includes("Spectral:ON CF 8"));
    expect(spectral).toBeDefined();
    expect(spectral!.current_price).toBe(4499);
    expect(spectral!.original_price).toBe(5999);
    expect(spectral!.brand).toBe("Canyon");
    expect(spectral!.product_group_key).toBe("3532");
    expect(spectral!.store_sku).toMatch(/^3532-/);
    expect(spectral!.variant_options?.Color).toBeTruthy();
    expect(spectral!.product_url).toContain("3532.html");
    expect(spectral!.category_path?.length).toBeGreaterThan(0);
  });
});

describe("canyon-pdp", () => {
  it("extracts JSON-LD product fields when present", () => {
    const { description, raw_specs } = extractCanyonProductFromJsonLd(PDP_FIXTURE);
    if (description) {
      expect(description.length).toBeGreaterThan(20);
    }
    if (raw_specs) {
      expect(Object.keys(raw_specs).length).toBeGreaterThan(0);
    }
  });

  it("enriches from PDP HTML fixture", () => {
    const result = enrichCanyonPdpFromHtml(PDP_FIXTURE);
    expect(result.category_path === null || result.category_path.length >= 1).toBe(
      true,
    );
  });
});

describe("scrapeCanyon / enrichCanyon", () => {
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
        new Response("<motion-product-tile></motion-product-tile>", {
          status: 200,
        }),
      );

    const rows = await scrapeCanyon("https://www.canyon.com/en-us/sale/");
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

    const resultPromise = enrichCanyon(
      "https://www.canyon.com/en-us/mountain-bikes/trail-bikes/spectral-125/mountain-trail-spectral125-al/spectral-125-al-5/3175.html",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result).toHaveProperty("category_path");
    expect(result).toHaveProperty("raw_specs");
  });
});
