import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSpecializedSaleSearchUrl,
  loadSpecializedGraphqlFixture,
  parseCategoryPathFromList,
  parseSpecializedSearchProductResponse,
} from "./specialized-plp.js";
import {
  enrichSpecializedPdpFromHtml,
  extractSpecializedBreadcrumbsFromHtml,
} from "./specialized-pdp.js";
import { enrichSpecialized, scrapeSpecialized } from "./specialized.js";

const PAGE2_FIXTURE = loadSpecializedGraphqlFixture("graphql-sale-page-2.json");

const PDP_HTML = `
<html><head>
<meta property="og:description" content="The all-new Stumpjumper 15 EVO obliterates every trade-off in the trail game." />
</head><body>
<ol itemtype="https://schema.org/BreadcrumbList">
<li itemprop="itemListElement"><span itemprop="name">Bikes</span></li>
<li itemprop="itemListElement"><span itemprop="name">Mountain Bikes</span></li>
<li itemprop="itemListElement"><span itemprop="name">Trail Bikes</span></li>
<li itemprop="itemListElement"><span itemprop="name">Stumpjumper</span></li>
</ol>
<section id="technical-specifications">
<div class="SpecContainer_specNameContainer__7dPFc"><h4>Frameset</h4></div>
<div class="SpecContainer_container__euRcV"><p>Carbon, 15mm offset</p></div>
</section>
</body></html>
`;

describe("specialized-plp helpers", () => {
  it("builds persisted GraphQL URL with page variable", () => {
    const url = buildSpecializedSaleSearchUrl(2);
    expect(url).toContain("SEARCH_PRODUCT_DATA");
    expect(url).toContain("operationName=SEARCH_PRODUCT_DATA");
    expect(decodeURIComponent(url)).toContain('"page":2');
    expect(url).toContain("bf8ddeb358a5285109e572678e70c6a5194f6c03dafd3203bc644141736234ee");
  });

  it("parses category list and drops calculator noise", () => {
    expect(
      parseCategoryPathFromList(
        "Suspension Calculator|Bikes|Mountain Bikes|Trail Bikes|Stumpjumper",
      ),
    ).toEqual(["Bikes", "Mountain Bikes", "Trail Bikes", "Stumpjumper"]);
  });
});

describe("parseSpecializedSearchProductResponse", () => {
  it("extracts per-swatch rows from GraphQL fixture", () => {
    const { rows, pagination } = parseSpecializedSearchProductResponse(PAGE2_FIXTURE);
    expect(pagination.totalResults).toBe(630);
    expect(pagination.totalPages).toBe(7);
    expect(rows.length).toBeGreaterThan(50);

    const stumpy = rows.find((r) => r.store_sku === "5366729-4221397");
    expect(stumpy).toBeDefined();
    expect(stumpy!.product_name).toContain("Stumpjumper 15 Comp Alloy");
    expect(stumpy!.current_price).toBe(2999.99);
    expect(stumpy!.original_price).toBe(3999.99);
    expect(stumpy!.brand).toBe("Specialized");
    expect(stumpy!.product_group_key).toBe("4221397");
    expect(stumpy!.product_url).toBe(
      "https://www.specialized.com/us/en/p/4221397?color=5366729-4221397",
    );
    expect(stumpy!.category_path).toContain("Mountain Bikes");
  });

  it("skips swatches without discount price", () => {
    const body = structuredClone(PAGE2_FIXTURE);
    const first = body.data!.searchProducts!.results![0]!;
    first.swatchesJSON![0]!.colorPrices!.minDiscountPrice = null;
    first.swatchesJSON![0]!.colorPrices!.minPrice = null;
    const { rows } = parseSpecializedSearchProductResponse(body);
    expect(rows.some((r) => r.store_sku === "5366729-4221397")).toBe(false);
  });
});

describe("specialized-pdp", () => {
  it("extracts breadcrumbs and og description", () => {
    const crumbs = extractSpecializedBreadcrumbsFromHtml(PDP_HTML);
    expect(crumbs).toEqual(["Bikes", "Mountain Bikes", "Trail Bikes"]);

    const result = enrichSpecializedPdpFromHtml(PDP_HTML);
    expect(result.description).toContain("Stumpjumper 15 EVO");
    expect(result.category_path).toEqual(["Bikes", "Mountain Bikes", "Trail Bikes"]);
  });
});

describe("scrapeSpecialized / enrichSpecialized", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("paginates GraphQL until totalPages", async () => {
    const page1 = structuredClone(PAGE2_FIXTURE);
    page1.data!.searchProducts!.pagination!.currentPage = 1;
    page1.data!.searchProducts!.pagination!.totalPages = 2;
    page1.data!.searchProducts!.results = page1.data!.searchProducts!.results!.slice(
      0,
      2,
    );

    const page2 = structuredClone(PAGE2_FIXTURE);
    page2.data!.searchProducts!.pagination!.currentPage = 2;
    page2.data!.searchProducts!.pagination!.totalPages = 2;
    page2.data!.searchProducts!.results = [];

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const rows = await scrapeSpecialized("https://www.specialized.com/us/en/shop/sale");
    expect(rows.length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("fetch enrich returns category or specs", async () => {
    vi.useFakeTimers();
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(PDP_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const resultPromise = enrichSpecialized(
      "https://www.specialized.com/us/en/p/4221397?color=5366729-4221397",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result).toHaveProperty("category_path");
    expect(result).toHaveProperty("raw_specs");
  });
});
