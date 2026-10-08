import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSpecializedSaleSearchRpcUrl,
  extractSpecializedRpcCode,
  loadSpecializedRpcFixture,
  parseCategoryPathFromList,
  parseSpecializedRpcSearchProductResponse,
} from "./specialized-plp.js";
import {
  enrichSpecializedPdpFromHtml,
  extractSpecializedBreadcrumbsFromHtml,
} from "./specialized-pdp.js";
import { enrichSpecialized, scrapeSpecialized } from "./specialized.js";

const PAGE1_FIXTURE = loadSpecializedRpcFixture("rpc-sale-page-1.json");

const SAMPLE_RPC_CODE =
  "eyJhbGciOiJIUzI1NiJ9._v39_v39.l8_DRBSB5VoAij-2rD6GtQ46tE19Wwwdgq567avVYfo~";

/** Live sale-page shape after Specialized added an extra `_fN` segment (ZAC-300). */
const SAMPLE_RPC_CODE_WITH_FEATURE =
  "eyJhbGciOiJIUzI1NiJ9._v39_v39_f4.42LoKd97CGawOeIjyvqNPlIImpCO-CPlJ1aGzJG7pBk~";

const SALE_HTML_WITH_CODE = `<html><body><script>window.__SBC__={"code":"${SAMPLE_RPC_CODE}"}</script></body></html>`;

const SALE_HTML_WITH_FEATURE_CODE = `<script>self.__next_f.push([1,"{\\"code\\":\\"${SAMPLE_RPC_CODE_WITH_FEATURE}\\"}"])</script>`;

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
  it("builds RPC searchProducts URL with coreParams and args", () => {
    const url = buildSpecializedSaleSearchRpcUrl(2, SAMPLE_RPC_CODE);
    expect(url).toContain("/api/rpc/search/searchProducts");
    expect(url).not.toContain("/api/graphql/");

    const parsed = new URL(url);
    const coreParams = JSON.parse(parsed.searchParams.get("coreParams")!);
    const args = JSON.parse(parsed.searchParams.get("args")!);

    expect(coreParams.baseSiteId).toBe("SBCUnitedStates");
    expect(coreParams.locale).toBe("en-US");
    expect(coreParams.code).toBe(SAMPLE_RPC_CODE);
    expect(args.pageConfigCategoryCode).toBe("sale");
    expect(args.page).toBe(2);
    expect(args.backgroundFilters).toEqual([{ key: "clearance_{country}", value: true }]);
    expect(args.temporaryAddlQueryString).toContain("page=2");
  });

  it("extracts the legacy _vN_vN RPC code token from sale HTML", () => {
    expect(extractSpecializedRpcCode(SALE_HTML_WITH_CODE)).toBe(SAMPLE_RPC_CODE);
  });

  it("extracts the _vN_vN_fN RPC code token from an RSC payload", () => {
    expect(extractSpecializedRpcCode(SALE_HTML_WITH_FEATURE_CODE)).toBe(
      SAMPLE_RPC_CODE_WITH_FEATURE,
    );
  });

  it("throws when RPC code token is missing from sale HTML", () => {
    expect(() => extractSpecializedRpcCode("<html><body>no token</body></html>")).toThrow(
      /RPC code token not found.*eyJhbGciOiJIUzI1NiJ9 not present/,
    );
  });

  it("includes a short HTML snippet when the JWT header is present but the token does not match", () => {
    const html =
      "<html>prefix eyJhbGciOiJIUzI1NiJ9.not-a-valid-middle.sig and trailing noise that should be truncated</html>";
    expect(() => extractSpecializedRpcCode(html)).toThrow(
      /near eyJhbGciOiJIUzI1NiJ9\.not-a-valid-middle\.sig/,
    );
  });

  it("parses category list and drops calculator noise", () => {
    expect(
      parseCategoryPathFromList(
        "Suspension Calculator|Bikes|Mountain Bikes|Trail Bikes|Stumpjumper",
      ),
    ).toEqual(["Bikes", "Mountain Bikes", "Trail Bikes", "Stumpjumper"]);
  });
});

describe("parseSpecializedRpcSearchProductResponse", () => {
  it("extracts per-swatch rows from RPC fixture", () => {
    const { rows, pagination } = parseSpecializedRpcSearchProductResponse(PAGE1_FIXTURE);
    expect(pagination.totalResults).toBe(569);
    expect(pagination.totalPages).toBe(6);
    expect(rows.length).toBeGreaterThan(0);

    const stumpy = rows.find((r) => r.store_sku === "5466825-4291508");
    expect(stumpy).toBeDefined();
    expect(stumpy!.product_name).toContain("S-Works Stumpjumper 15 EVO");
    expect(stumpy!.brand).toBe("Specialized");
    expect(stumpy!.product_group_key).toBe("4291508");
    expect(stumpy!.product_url).toBe(
      "https://www.specialized.com/us/en/p/4291508?color=5466825-4291508",
    );
    expect(stumpy!.category_path).toContain("Mountain Bikes");
  });

  it("skips swatches without discount price", () => {
    const body = structuredClone(PAGE1_FIXTURE);
    const first = body.data!.results![0]!;
    first.swatchesJSON![0]!.colorPrices!.minDiscountPrice = null;
    first.swatchesJSON![0]!.colorPrices!.minPrice = null;
    const { rows } = parseSpecializedRpcSearchProductResponse(body);
    expect(rows.some((r) => r.store_sku === "5466825-4291508")).toBe(false);
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

  it("fetches sale HTML for code then paginates RPC until totalPages", async () => {
    const page1 = structuredClone(PAGE1_FIXTURE);
    page1.data!.pagination!.currentPage = 1;
    page1.data!.pagination!.totalPages = 2;
    page1.data!.results = page1.data!.results!.slice(0, 2);

    const page2 = structuredClone(PAGE1_FIXTURE);
    page2.data!.pagination!.currentPage = 2;
    page2.data!.pagination!.totalPages = 2;
    page2.data!.results = [];

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(SALE_HTML_WITH_CODE, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const firstCall = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(firstCall).toContain("/us/en/shop/sale");

    const secondCall = vi.mocked(globalThis.fetch).mock.calls[1]![0] as string;
    expect(secondCall).toContain("/api/rpc/search/searchProducts");
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
