import { describe, expect, it } from "vitest";
import {
  extractBreadcrumbsFromHtml,
  isPlausibleCategoryLabel,
  isTrustedShopifyProductType,
  resolveShopifyCategoryPath,
} from "../shopify-helpers.js";

const MISLEADING_NAV_HTML = `
<html>
  <body>
    <a href="/collections/electric-bikes/electric">Electric Commuter & Urban Bikes</a>
    <script>productCollections: []</script>
  </body>
</html>
`;

const BREADCRUMB_HTML = `
<html>
  <script type="application/ld+json">
  {"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Components"},{"name":"FU50"}]}
  </script>
</html>
`;

describe("resolveShopifyCategoryPath", () => {
  it("prefers product_type from Shopify JSON over misleading HTML nav breadcrumbs", () => {
    expect(resolveShopifyCategoryPath("Shifters", MISLEADING_NAV_HTML)).toEqual([
      "Shifters",
    ]);
  });

  it("trims whitespace from product_type", () => {
    expect(resolveShopifyCategoryPath("  Shifters  ", MISLEADING_NAV_HTML)).toEqual([
      "Shifters",
    ]);
  });

  it("falls back to HTML breadcrumbs when product_type is empty", () => {
    expect(resolveShopifyCategoryPath("", BREADCRUMB_HTML)).toEqual([
      "Components",
    ]);
  });

  it("falls back to HTML breadcrumbs when product_type is null", () => {
    expect(resolveShopifyCategoryPath(null, BREADCRUMB_HTML)).toEqual([
      "Components",
    ]);
  });

  it("returns null when product_type and html are both missing", () => {
    expect(resolveShopifyCategoryPath(null, null)).toBeNull();
    expect(resolveShopifyCategoryPath(undefined, "")).toBeNull();
  });

  it("falls back to HTML breadcrumbs when product_type is the Ride Bicycles electric catch-all (ZAC-273)", () => {
    expect(
      resolveShopifyCategoryPath(
        "Electric Commuter & Urban Bikes",
        BREADCRUMB_HTML,
      ),
    ).toEqual(["Components"]);
  });

  it("returns null for the electric catch-all when there are no breadcrumbs", () => {
    expect(
      resolveShopifyCategoryPath("Electric Commuter & Urban Bikes", null),
    ).toBeNull();
  });
});

describe("isTrustedShopifyProductType", () => {
  it("accepts real Shopify types", () => {
    expect(isTrustedShopifyProductType("Shifters")).toBe(true);
    expect(isTrustedShopifyProductType("Mountain Bike")).toBe(true);
  });

  it("rejects the Ride Bicycles electric catch-all", () => {
    expect(isTrustedShopifyProductType("Electric Commuter & Urban Bikes")).toBe(
      false,
    );
    expect(isTrustedShopifyProductType("  electric commuter & urban bikes  ")).toBe(
      false,
    );
    expect(isTrustedShopifyProductType("")).toBe(false);
  });
});

const BIKES_ONLINE_HEADLINE =
  "Hardtail Mountain Bikes Conquer Every Trail with a Lightweight, Efficient Hard Tail Mountain Bike";

describe("isPlausibleCategoryLabel", () => {
  it("accepts short shoppable labels", () => {
    expect(isPlausibleCategoryLabel("Bikes")).toBe(true);
    expect(isPlausibleCategoryLabel("Hardtail Mountain Bikes")).toBe(true);
    expect(isPlausibleCategoryLabel("Components")).toBe(true);
  });

  it("rejects Bikes Online collection marketing copy", () => {
    expect(isPlausibleCategoryLabel(BIKES_ONLINE_HEADLINE)).toBe(false);
  });

  it("rejects the Ride Bicycles electric catch-all collection label (ZAC-273)", () => {
    expect(isPlausibleCategoryLabel("Electric Commuter & Urban Bikes")).toBe(
      false,
    );
  });
});

describe("extractBreadcrumbsFromHtml", () => {
  it("ignores a marketing H1 in Collections: links (ZAC-234)", () => {
    const html = `
      <div>Collections:
        <a href="/collections/hardtail">${BIKES_ONLINE_HEADLINE}</a>
        <a href="/collections/bikes">Bikes</a>
      </div>`;
    expect(extractBreadcrumbsFromHtml(html)).toEqual(["Bikes"]);
  });

  it("returns null when the only collection link is marketing copy", () => {
    const html = `
      <div>Collections:
        <a href="/collections/hardtail">${BIKES_ONLINE_HEADLINE}</a>
      </div>`;
    expect(extractBreadcrumbsFromHtml(html)).toBeNull();
  });
});
