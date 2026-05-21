import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTrekCategoryProductsUrl,
  buildTrekProductUrl,
  loadTrekFixture,
  parseTrekOccProductsResponse,
  parseTrekWasPriceRangeByCode,
  parseUsdPrice,
  scrapeTrekSalePl,
} from "./trek-plp.js";
import {
  enrichTrekPdpFromHtml,
  extractTrekBreadcrumbsFromHtml,
} from "./trek-pdp.js";

const OCC_FIXTURE = loadTrekFixture("occ-category-b300-sale.json");

function loadPlpSnippet(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(dir, "__fixtures__", "trek", "plp-was-price-snippet.html"),
    "utf8",
  );
}

const PDP_HTML = `
<html><head>
<meta property="og:description" content="Chase down long days and extra laps on Slash+. Capable, quiet, and with tons of travel." />
</head><body>
<nav id="breadcrumbs">
<ul class="breadcrumb">
<li class="breadcrumb__item"><a href="/us/en_US/">Home</a></li>
<li class="breadcrumb__item"><a href="/us/en_US/bikes/c/B100/">Bikes</a></li>
<li class="breadcrumb__item"><a href="/us/en_US/bikes/mountain-bikes/c/B300/">Mountain bikes</a></li>
<li class="breadcrumb__item"><a href="/us/en_US/bikes/mountain-bikes/electric-mountain-bikes/c/B512/">Electric mountain bikes</a></li>
<li class="breadcrumb__item"><a href="/us/en_US/bikes/mountain-bikes/electric-mountain-bikes/slash/c/B347/" aria-current="page">Slash+</a></li>
</ul>
</nav>
</body></html>
`;

describe("trek-plp helpers", () => {
  it("builds OCC category products URL", () => {
    const url = buildTrekCategoryProductsUrl(0);
    expect(url).toContain("/categories/B300/products");
    expect(url).toContain("saleFlag%3Atrue");
    expect(url).toContain("currentPage=0");
  });

  it("parses USD prices including comma formatting", () => {
    expect(parseUsdPrice("$12,499.99")).toBe(12499.99);
    expect(parseUsdPrice("from $3,599.93")).toBe(3599.93);
  });

  it("builds absolute product URLs", () => {
    expect(
      buildTrekProductUrl("/bikes/mountain-bikes/electric-mountain-bikes/slash/slash-9-9/p/57635/"),
    ).toBe(
      "https://www.trekbikes.com/us/en_US/bikes/mountain-bikes/electric-mountain-bikes/slash/slash-9-9/p/57635/",
    );
  });

  it("parses wasPriceRange from Vue product blocks", () => {
    const map = parseTrekWasPriceRangeByCode(loadPlpSnippet());
    expect(map.get("57635")).toBe("$12,499.99");
    expect(map.get("57406")).toBe("$8,899.99");
  });
});

describe("parseTrekOccProductsResponse", () => {
  it("extracts sale rows from OCC fixture with wasPrice merge", () => {
    const wasPriceByCode = new Map([["57635", "$12,499.99"]]);
    const { rows, pagination } = parseTrekOccProductsResponse(OCC_FIXTURE, wasPriceByCode);
    expect(pagination.totalResults).toBe(23);
    expect(rows.length).toBeGreaterThan(20);

    const slash = rows.find((r) => r.store_sku === "57635");
    expect(slash).toBeDefined();
    expect(slash!.product_name).toBe("Slash+ 9.9");
    expect(slash!.current_price).toBe(10999.97);
    expect(slash!.original_price).toBe(12499.99);
    expect(slash!.brand).toBe("Trek");
    expect(slash!.product_group_key).toBe("57635");
    expect(slash!.category_path).toEqual(["Mountain bikes", "Electric mountain bikes"]);
    expect(slash!.product_url).toContain("/p/57635/");
  });

  it("skips non-sale products", () => {
    const body = structuredClone(OCC_FIXTURE);
    body.products![0]!.saleFlag = false;
    const { rows } = parseTrekOccProductsResponse(body);
    expect(rows.some((r) => r.store_sku === body.products![0]!.code)).toBe(false);
  });
});

describe("trek-pdp helpers", () => {
  it("extracts breadcrumbs without home and current page", () => {
    expect(extractTrekBreadcrumbsFromHtml(PDP_HTML)).toEqual([
      "Bikes",
      "Mountain bikes",
      "Electric mountain bikes",
    ]);
  });

  it("returns enrich result with description", () => {
    const result = enrichTrekPdpFromHtml(PDP_HTML);
    expect(result.category_path).toContain("Mountain bikes");
    expect(result.description).toContain("Slash+");
    expect(result.raw_specs).toBeNull();
  });
});

describe("scrapeTrekSalePl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges OCC products with PLP wasPriceRange", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.trekbikes.com")) {
        return new Response(JSON.stringify(OCC_FIXTURE), { status: 200 });
      }
      if (url.includes("trekbikes.com")) {
        return new Response(loadPlpSnippet(), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const rows = await scrapeTrekSalePl(
      "https://www.trekbikes.com/us/en_US/bikes/mountain-bikes/c/B300/?pageSize=24&q=%3Arelevance%3AsaleFlag%3Atrue&sort=relevance",
    );
    expect(rows.length).toBeGreaterThan(20);
    const slash = rows.find((r) => r.store_sku === "57635");
    expect(slash?.original_price).toBe(12499.99);
  });
});
